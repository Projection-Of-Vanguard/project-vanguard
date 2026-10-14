package com.projectvanguard.steamredesigned;

import android.content.Context;
import android.net.http.HttpResponseCache;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serves the home server (ProjectServer on a PC on the same Wi-Fi) to the app's page at
 * https://app.projectvanguard/_home/<http|https>/<host[:port]>/(api|img)/...
 *
 * The home server speaks plain http on the LAN, which the https page may not load itself (mixed
 * content), so these requests are fetched here instead. Only GET requests for data and photos pass:
 * no documents, frames or scripts (they would run remote content at the app's origin), no
 * redirects, and only JSON and image responses. Photos go through Android's HTTP cache on the
 * phone, so photos (cached for 30 days by the server) are not downloaded again.
 */
public class HomeServerProxy extends BridgeWebViewClient {
    private static final Pattern PATH = Pattern.compile("^/_home/(https?)/([A-Za-z0-9.-]{1,253}(?::\\d{1,5})?)(/(?:api|img)/[A-Za-z0-9._~%/@:+,=-]*)$");
    private static final Pattern TYPE = Pattern.compile("^(application/json|image/(?:jpeg|png|gif|webp|avif))\\b.*", Pattern.CASE_INSENSITIVE);
    private static final long CACHE_BYTES = 300L * 1024 * 1024;

    private final Bridge bridge;

    public HomeServerProxy(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    /** Android's own HTTP cache for HttpURLConnection, kept in the app's cache folder. */
    static void installCache(Context ctx) {
        try {
            if (HttpResponseCache.getInstalled() == null) HttpResponseCache.install(new File(ctx.getCacheDir(), "home-server"), CACHE_BYTES);
        } catch (Exception e) {
            // No cache: everything still works, photos just come from the server each time
        }
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String path = request.getUrl().getPath();
        if (path == null || !path.startsWith("/_home/") || !bridge.getHost().equals(request.getUrl().getHost())) return super.shouldInterceptRequest(view, request);
        if (!"GET".equals(request.getMethod()) || isDocument(request)) return error(403, "Forbidden");
        Matcher m = PATH.matcher(path);
        if (!m.matches() || path.contains("/../") || path.contains("/./")) return error(400, "Bad Request");
        String query = request.getUrl().getEncodedQuery();
        String target = m.group(1) + "://" + m.group(2) + m.group(3) + (query == null ? "" : "?" + query);
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(target).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setUseCaches(m.group(3).startsWith("/img/")); // photos are kept on the phone; data always comes fresh from the server
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("Accept", "application/json, image/*");
            conn.setRequestProperty("X-Vanguard-Base", "/_home/" + m.group(1) + "/" + m.group(2));
            int status = conn.getResponseCode();
            String type = conn.getContentType();
            if (type == null || !TYPE.matcher(type).matches()) {
                conn.disconnect();
                return error(502, "Bad Gateway");
            }
            InputStream body = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);
            Map<String, String> headers = new HashMap<>();
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("Cache-Control", "no-store"); // the phone's HTTP cache above does the caching
            String mime = type.split(";")[0].trim().toLowerCase();
            String reason = conn.getResponseMessage();
            return new WebResourceResponse(mime, "application/json".equals(mime) ? "utf-8" : null, status, reason == null || reason.isEmpty() ? "OK" : reason, headers, body);
        } catch (Exception e) {
            return error(502, "Bad Gateway");
        }
    }

    private static boolean isDocument(WebResourceRequest request) {
        if (request.isForMainFrame()) return true;
        Map<String, String> headers = request.getRequestHeaders();
        if (headers == null) return false;
        for (Map.Entry<String, String> h : headers.entrySet()) {
            if ("Upgrade-Insecure-Requests".equalsIgnoreCase(h.getKey())) return true;
            if ("Sec-Fetch-Dest".equalsIgnoreCase(h.getKey()) && h.getValue() != null && h.getValue().matches("(?i)document|iframe|frame|embed|object|worker|sharedworker|serviceworker|script|style")) return true;
        }
        return false;
    }

    private static WebResourceResponse error(int status, String reason) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        byte[] body = ("{\"error\":\"" + reason + "\"}").getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse("application/json", "utf-8", status, reason, headers, new ByteArrayInputStream(body));
    }
}
