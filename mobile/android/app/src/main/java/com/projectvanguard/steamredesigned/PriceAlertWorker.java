package com.projectvanguard.steamredesigned;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;

/** Checks price alerts, wishlist deals and the deal feed in the background, about every hour. */
public class PriceAlertWorker extends Worker {
    private static final String NAME = "price-alerts";

    public PriceAlertWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        PriceAlertChecker.check(getApplicationContext());
        return Result.success();
    }

    /** Is the hourly check waiting to run? (Blocks briefly; call it off the main thread.) */
    static boolean isScheduled(Context ctx) {
        try {
            for (WorkInfo w : WorkManager.getInstance(ctx).getWorkInfosForUniqueWork(NAME).get(3, TimeUnit.SECONDS)) if (!w.getState().isFinished()) return true;
        } catch (Exception e) { /* unknown: report not scheduled */ }
        return false;
    }

    /** Starts the periodic check when there are alerts, and stops it when there are none. */
    static void schedule(Context ctx) {
        WorkManager wm = WorkManager.getInstance(ctx);
        if (!PriceAlertChecker.hasWork(ctx)) {
            wm.cancelUniqueWork(NAME);
            return;
        }
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(PriceAlertWorker.class, 1, TimeUnit.HOURS)
            .setConstraints(net)
            .build();
        wm.enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.UPDATE, req);
    }
}
