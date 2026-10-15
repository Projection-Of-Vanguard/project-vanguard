package com.projectvanguard.steamredesigned;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The phone's hourly check, run by the app (PriceAlertsPlugin) and in the background (PriceAlertWorker):
 *   1. price alerts: games at or below the price you set
 *   2. wishlist deals: wishlisted games that drop 50% or more
 *   3. the deal feed: games that just became free to keep, and big discounts on popular games
 * Data comes from your home server when it answers, otherwise from the online service.
 * Each drop or deal is announced once; the shared record lives in SharedPreferences.
 */
final class PriceAlertChecker {
    static final String PREFS = "price_alerts";
    static final String CHANNEL = "price_alerts";
    static final String DEALS_CHANNEL = "deals";
    static final String EXTRA_GAME = "vanguard_game";
    /** The online service; a home server address comes from the app (validated in PriceAlertsPlugin). */
    static final String ONLINE = "https://projectvanguard.vercel.app";
    private static final int MAX_DEAL_NOTIFICATIONS = 3;

    private PriceAlertChecker() {}

    static JSONObject targets(Context ctx) { return json(ctx, "targets", "{}"); }

    static boolean hasWork(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return targets(ctx).length() > 0 || p.getBoolean("notifyFree", true) || p.getBoolean("notifyDeals", true);
    }

    /** Checks now. Runs network I/O, so call it off the main thread. Returns everything announced. */
    static synchronized JSONArray check(Context ctx) {
        JSONArray announced = new JSONArray();
        SharedPreferences prefs = prefs(ctx);
        String base = pickServer(prefs.getString("server", ""));
        try { priceAlerts(ctx, base, announced); } catch (Exception e) { /* offline: try again next time */ }
        try { dealFeed(ctx, base, announced); } catch (Exception e) { /* offline: try again next time */ }
        return announced;
    }

    /** The home server if it answers quickly, otherwise the online service. */
    private static String pickServer(String home) {
        if (home != null && home.matches("^https?://[A-Za-z0-9.-]+(:\\d{1,5})?$")) {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(home + "/api/status").openConnection();
                c.setUseCaches(false);
                c.setConnectTimeout(5000);
                c.setReadTimeout(5000);
                int code = c.getResponseCode();
                c.disconnect();
                if (code == 200) return home;
            } catch (Exception e) { /* away from home */ }
        }
        return ONLINE;
    }

    private static void priceAlerts(Context ctx, String base, JSONArray announced) throws Exception {
        SharedPreferences prefs = prefs(ctx);
        JSONObject targets = targets(ctx);
        Set<String> wishlist = new LinkedHashSet<>();
        JSONArray wl = new JSONArray(prefs.getString("wishlist", "[]"));
        for (int i = 0; i < wl.length(); i++) wishlist.add(String.valueOf(wl.optLong(i)));
        boolean wishlistDeals = prefs.getBoolean("notifyDeals", true);
        Set<String> ids = new LinkedHashSet<>();
        for (Iterator<String> it = targets.keys(); it.hasNext(); ) ids.add(it.next());
        if (wishlistDeals) ids.addAll(wishlist);
        ids.removeIf((id) -> !id.matches("\\d{1,8}"));
        if (ids.isEmpty()) return;
        List<String> list = new ArrayList<>(ids);
        JSONObject prices = fetch(base + "/api/prices?ids=" + String.join(",", list.subList(0, Math.min(100, list.size())))).optJSONObject("prices");
        if (prices == null) return;
        JSONObject seen = json(ctx, "seen", "{}");
        JSONObject seenDeals = json(ctx, "seenDeals", "{}");
        for (String id : list) {
            JSONObject p = prices.optJSONObject(id);
            if (p == null || p.isNull("price")) continue;
            long price = p.optLong("price");
            String name = p.optString("name", "A game on your wishlist");
            long target = targets.optLong(id, -1);
            if (target >= 0) {
                if (price <= target) {
                    if (seen.optLong(id, -1) != price) {
                        seen.put(id, price);
                        announce(ctx, CHANNEL, Long.parseLong(id), name + " reached your price",
                            String.format(Locale.US, "Now $%.2f, at or below your alert price of $%.2f.", price / 100.0, target / 100.0), announced);
                        continue;
                    }
                } else {
                    seen.remove(id); // back above the target: alert again next time it drops
                }
            }
            int disc = p.optInt("disc", 0);
            if (wishlistDeals && wishlist.contains(id)) {
                if (disc >= 50 && seenDeals.optInt(id, 0) < disc) {
                    seenDeals.put(id, disc);
                    announce(ctx, DEALS_CHANNEL, Long.parseLong(id), name + " is " + disc + "% off",
                        String.format(Locale.US, "A game on your wishlist is now $%.2f.", price / 100.0), announced);
                } else if (disc < 50) {
                    seenDeals.remove(id);
                }
            }
        }
        prefs.edit().putString("seen", seen.toString()).putString("seenDeals", seenDeals.toString()).apply();
    }

    private static void dealFeed(Context ctx, String base, JSONArray announced) throws Exception {
        SharedPreferences prefs = prefs(ctx);
        boolean free = prefs.getBoolean("notifyFree", true), deals = prefs.getBoolean("notifyDeals", true);
        if (!free && !deals) return;
        long since = prefs.getLong("eventsSince", -1);
        JSONObject feed = fetch(base + "/api/events?since=" + Math.max(0, since));
        long now = feed.optLong("now", System.currentTimeMillis() / 1000);
        // The first check only remembers where the feed is, so you don't get a week of old deals at once
        if (since < 0) { prefs.edit().putLong("eventsSince", now).apply(); return; }
        JSONArray events = feed.optJSONArray("events");
        JSONObject seenDeals = json(ctx, "seenDeals", "{}");
        List<JSONObject> fresh = new ArrayList<>();
        long seenUpTo = now; // never behind an event already handled, even if the clocks disagree
        for (int i = 0; events != null && i < events.length(); i++) {
            JSONObject e = events.getJSONObject(i);
            seenUpTo = Math.max(seenUpTo, e.optLong("ts"));
            String type = e.optString("type");
            if (("free".equals(type) && free) || ("deal".equals(type) && deals)) {
                if ("deal".equals(type) && seenDeals.optInt(String.valueOf(e.optLong("id")), 0) >= e.optInt("disc")) continue; // already told as a wishlist deal
                fresh.add(e);
            }
        }
        int shown = 0;
        for (JSONObject e : fresh) {
            if (shown == MAX_DEAL_NOTIFICATIONS) break;
            long id = e.optLong("id");
            String name = e.optString("name", "A Steam game");
            if ("free".equals(e.optString("type"))) {
                announce(ctx, DEALS_CHANNEL, id, name + " is free to keep",
                    e.isNull("orig") ? "Free on Steam for a limited time." : String.format(Locale.US, "Usually $%.2f. Free on Steam for a limited time.", e.optLong("orig") / 100.0), announced);
            } else {
                announce(ctx, DEALS_CHANNEL, id, name + " is " + e.optInt("disc") + "% off",
                    String.format(Locale.US, "Now $%.2f on Steam.", e.optLong("price") / 100.0), announced);
            }
            shown++;
        }
        if (fresh.size() > shown) {
            announce(ctx, DEALS_CHANNEL, 0, (fresh.size() - shown) + " more deals on Steam", "Open Steam Redesigned to see this hour's free games and discounts.", announced);
        }
        prefs.edit().putLong("eventsSince", seenUpTo).apply();
    }

    private static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static JSONObject json(Context ctx, String key, String fallback) {
        try { return new JSONObject(prefs(ctx).getString(key, fallback)); } catch (Exception e) { return new JSONObject(); }
    }

    private static JSONObject fetch(String address) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setUseCaches(false); // alerts need the current prices, never a cached answer
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("Accept", "application/json");
        try {
            if (c.getResponseCode() != 200) throw new IllegalStateException("HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n, total = 0;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > 512 * 1024) throw new IllegalStateException("response too large");
                    out.write(buf, 0, n);
                }
                return new JSONObject(out.toString("UTF-8"));
            }
        } finally {
            c.disconnect();
        }
    }

    /**
     * Settings > Notifications > "Free game notification test": posts one notification on the same
     * channel free-game alerts use, and reports everything that could stop the real ones.
     */
    static JSONObject testFreeGame(Context ctx) throws Exception {
        JSONObject r = new JSONObject();
        boolean permission = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        boolean appOn = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        ensureChannel(ctx);
        boolean channelOn = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            NotificationChannel ch = nm == null ? null : nm.getNotificationChannel(DEALS_CHANNEL);
            channelOn = ch == null || ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        boolean free = prefs(ctx).getBoolean("notifyFree", true);
        boolean sent = permission && appOn && channelOn;
        if (sent) announce(ctx, DEALS_CHANNEL, 0, "Test: free game alerts work",
            "This is how you'll hear when a game becomes free to keep. Turn these on or off in Settings > Notifications.", new JSONArray());
        r.put("permission", permission);
        r.put("appEnabled", appOn);
        r.put("channelEnabled", channelOn);
        r.put("notifyFree", free);
        r.put("server", prefs(ctx).getString("server", ""));
        r.put("sent", sent);
        return r;
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Price alerts", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("When a game reaches the price you set");
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(DEALS_CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(DEALS_CHANNEL, "Deals and free games", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("New free-to-keep games and big discounts");
            nm.createNotificationChannel(ch);
        }
    }

    /** Posts one notification (tapping it opens the game, or the app for id 0) and records it. */
    private static void announce(Context ctx, String channel, long id, String title, String text, JSONArray announced) throws Exception {
        JSONObject hit = new JSONObject();
        hit.put("id", id); hit.put("title", title); hit.put("text", text); hit.put("channel", channel);
        announced.put(hit);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (id > 0) open.putExtra(EXTRA_GAME, id);
        int nid = (channel.equals(CHANNEL) ? 1 : 2) * 100000000 + (int) (id % 100000000);
        PendingIntent tap = PendingIntent.getActivity(ctx, nid, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_stat_vanguard)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        NotificationManagerCompat.from(ctx).notify(nid, b.build());
    }
}
