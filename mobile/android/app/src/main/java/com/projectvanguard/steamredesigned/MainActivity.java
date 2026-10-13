package com.projectvanguard.steamredesigned;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PriceAlertsPlugin.class);
        super.onCreate(savedInstanceState);
        openGameFrom(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openGameFrom(intent);
    }

    /** A tapped price-alert notification opens that game's page once the app has loaded. */
    private void openGameFrom(Intent intent) {
        if (intent == null) return;
        long id = intent.getLongExtra(PriceAlertChecker.EXTRA_GAME, -1);
        intent.removeExtra(PriceAlertChecker.EXTRA_GAME);
        if (id <= 0 || id > 99999999L) return;
        final String js = "(function(){ if (!window.STPrefs) return 'wait'; location.hash = '#/app/" + id + "'; return 'ok'; })()";
        final Handler handler = new Handler(Looper.getMainLooper());
        final int[] tries = { 0 };
        handler.post(new Runnable() {
            @Override
            public void run() {
                WebView web = getBridge() == null ? null : getBridge().getWebView();
                if (web == null) { if (++tries[0] < 30) handler.postDelayed(this, 300); return; }
                web.evaluateJavascript(js, (result) -> { if (!"\"ok\"".equals(result) && ++tries[0] < 30) handler.postDelayed(this, 300); });
            }
        });
    }
}
