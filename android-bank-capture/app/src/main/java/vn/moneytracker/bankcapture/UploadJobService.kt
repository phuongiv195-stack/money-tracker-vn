package vn.moneytracker.bankcapture

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context

/** Retries uploads once the network is back, with exponential backoff. Survives reboots. */
class UploadJobService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Uploader.runInBackground {
            val done = Uploader.uploadPending(applicationContext)
            jobFinished(params, !done)
        }
        return true
    }

    override fun onStopJob(params: JobParameters) = true

    companion object {
        private const val JOB_ID = 1001

        fun schedule(ctx: Context) {
            val scheduler = ctx.getSystemService(JobScheduler::class.java)
            if (scheduler.getPendingJob(JOB_ID) != null) return // don't interrupt a scheduled/running retry
            val job = JobInfo.Builder(JOB_ID, ComponentName(ctx, UploadJobService::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(60_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .setPersisted(true)
                .build()
            scheduler.schedule(job)
        }
    }
}
