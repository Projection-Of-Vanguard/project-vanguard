package com.projectvanguard.steamredesigned;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Bridge for js/alerts.js: saves the alert targets for background checks, checks now on request,
 * and asks for the notification permission (Android 13 and later).
 */
@CapacitorPlugin(name = "PriceAlerts", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class PriceAlertsPlugin extends Plugin {

    /** targets: JSON string { "appid": cents }. Anything malformed is dropped. */
    @PluginMethod
    public void sync(PluginCall call) {
        JSONObject clean = new JSONObject();
        try {
            JSONObject in = new JSONObject(call.getString("targets", "{}"));
            int count = 0;
            for (Iterator<String> it = in.keys(); it.hasNext() && count < 100; ) {
                String id = it.next();
                long cents = in.optLong(id, -1);
                if (id.matches("\\d{1,8}") && cents >= 0 && cents < 100000000L) { clean.put(id, cents); count++; }
            }
        } catch (Exception e) {
            call.reject("Invalid alert list");
            return;
        }
        getContext().getSharedPreferences(PriceAlertChecker.PREFS, android.content.Context.MODE_PRIVATE).edit().putString("targets", clean.toString()).apply();
        PriceAlertWorker.schedule(getContext());
        call.resolve();
    }

    @PluginMethod
    public void checkNow(PluginCall call) {
        new Thread(() -> {
            JSONArray hits = PriceAlertChecker.check(getContext());
            JSObject ret = new JSObject();
            ret.put("hits", hits);
            call.resolve(ret);
        }).start();
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            PriceAlertChecker.ensureChannel(getContext());
            JSObject ret = new JSObject();
            ret.put("notifications", "granted");
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionDone");
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) {
        PriceAlertChecker.ensureChannel(getContext());
        JSObject ret = new JSObject();
        ret.put("notifications", getPermissionState("notifications").toString());
        call.resolve(ret);
    }
}
