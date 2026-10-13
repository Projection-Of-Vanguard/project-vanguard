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
import java.util.Iterator;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Price alerts on the phone: compares the current prices of games with an alert against their
 * targets and posts one Android notification per new drop. Used by the app (PriceAlertsPlugin)
 * and by the background worker (PriceAlertWorker), which share the "already notified" record.
 */
final class PriceAlertChecker {
    static final String PREFS = "price_alerts";
    static final String CHANNEL = "price_alerts";
    static final String EXTRA_GAME = "vanguard_game";
    /** Fixed: the app only ever asks this project's read-only API. */
    private static final String API = "https://projectvanguard.vercel.app/api/prices?ids=";

    private PriceAlertChecker() {}

    /** Targets as { "appid": cents }, saved by the app when an alert is set or removed. */
    static JSONObject targets(Context ctx) {
        try {
            return new JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("targets", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** Checks prices now. Runs network I/O, so call it off the main thread. Returns the new hits. */
    static synchronized JSONArray check(Context ctx) {
        JSONArray hits = new JSONArray();
        JSONObject targets = targets(ctx);
        if (targets.length() == 0) return hits;
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            StringBuilder ids = new StringBuilder();
            for (Iterator<String> it = targets.keys(); it.hasNext(); ) {
                String id = it.next();
                if (!id.matches("\\d{1,8}")) continue;
                if (ids.length() > 0) ids.append(',');
                ids.append(id);
            }
            if (ids.length() == 0) return hits;
            JSONObject prices = fetch(API + ids).optJSONObject("prices");
            if (prices == null) return hits;
            JSONObject seen = new JSONObject(prefs.getString("seen", "{}"));
            for (Iterator<String> it = targets.keys(); it.hasNext(); ) {
                String id = it.next();
                JSONObject p = prices.optJSONObject(id);
                if (p == null || p.isNull("price")) continue;
                long price = p.optLong("price"), target = targets.optLong(id, -1);
                if (target < 0) continue;
                if (price <= target) {
                    if (seen.optLong(id, -1) != price) {
                        JSONObject hit = new JSONObject();
                        hit.put("id", Long.parseLong(id));
                        hit.put("name", p.optString("name", "A game on your wishlist"));
                        hit.put("price", price);
                        hit.put("target", target);
                        hits.put(hit);
                        seen.put(id, price);
                    }
                } else {
                    seen.remove(id); // back above the target: alert again next time it drops
                }
            }
            prefs.edit().putString("seen", seen.toString()).apply();
            for (int i = 0; i < hits.length(); i++) notify(ctx, hits.getJSONObject(i));
        } catch (Exception e) {
            // Offline or the service is unavailable: try again next time
        }
        return hits;
    }

    private static JSONObject fetch(String address) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
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

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Price alerts", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("When a game on your wishlist drops to your alert price");
        nm.createNotificationChannel(ch);
    }

    private static void notify(Context ctx, JSONObject hit) throws Exception {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        ensureChannel(ctx);
        long id = hit.getLong("id");
        Intent open = new Intent(ctx, MainActivity.class).putExtra(EXTRA_GAME, id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, (int) (id % Integer.MAX_VALUE), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String name = hit.getString("name");
        String text = String.format(Locale.US, "Now $%.2f, at or below your alert price of $%.2f.", hit.getLong("price") / 100.0, hit.getLong("target") / 100.0);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_vanguard)
            .setContentTitle(name + " reached your price")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        NotificationManagerCompat.from(ctx).notify((int) (id % Integer.MAX_VALUE), b.build());
    }
}
