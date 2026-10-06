package vn.moneytracker.bankcapture

import java.net.HttpURLConnection
import java.net.URL

/** Minimal blocking HTTP client. Throws IOException on network failure; call off the main thread. */
object Http {
    class Response(val code: Int, val body: String)

    fun post(
        url: String,
        body: String,
        contentType: String = "application/json",
        bearer: String? = null,
    ): Response {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "$contentType; charset=utf-8")
            if (bearer != null) conn.setRequestProperty("Authorization", "Bearer $bearer")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            return Response(code, text)
        } finally {
            conn.disconnect()
        }
    }
}
