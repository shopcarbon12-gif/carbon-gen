package com.shopcarbon.collectionmapping.ui.screens

import android.annotation.SuppressLint
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

private fun collectCookiesForOrigin(origin: String): String {
    val cm = CookieManager.getInstance()
    cm.flush()
    val base = origin.trim().trimEnd('/')
    val urls = listOf(base, "$base/", "$base/login")
    return urls
        .mapNotNull { cm.getCookie(it)?.takeIf { c -> c.isNotBlank() } }
        .maxByOrNull { it.length }
        .orEmpty()
}

private fun looksLoggedIn(cookieHeader: String): Boolean =
    cookieHeader.contains("carbon_gen_auth_v1=true", ignoreCase = true)

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ShopCarbonSessionWebViewDialog(
    apiBaseUrl: String,
    onDismiss: () -> Unit,
    onCookiesCaptured: (String) -> Unit,
) {
    val origin = remember(apiBaseUrl) { apiBaseUrl.trim().trimEnd('/') }
    val loginUrl = remember(origin) { "$origin/login" }
    val onCaptured by rememberUpdatedState(onCookiesCaptured)
    var status by remember { mutableStateOf("Sign in below. When the app sees your session cookie, it saves automatically. You can also tap \"Save session now\".") }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxSize().padding(12.dp)) {
                Text(
                    "Sign in to ShopCarbon",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    status,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                AndroidView(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    factory = { context ->
                        WebView(context).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            val cm = CookieManager.getInstance()
                            cm.setAcceptCookie(true)
                            cm.setAcceptThirdPartyCookies(this, true)
                            webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(
                                    view: WebView?,
                                    request: WebResourceRequest?,
                                ): Boolean {
                                    val url = request?.url?.toString().orEmpty()
                                    if (url.isNotEmpty() && !url.startsWith(origin)) {
                                        return false
                                    }
                                    return false
                                }

                                override fun onPageFinished(view: WebView?, url: String?) {
                                    super.onPageFinished(view, url)
                                    val raw = collectCookiesForOrigin(origin)
                                    if (raw.isNotEmpty()) {
                                        if (looksLoggedIn(raw)) {
                                            onCaptured(raw)
                                        } else {
                                            status = "No session cookie yet. Finish logging in, then tap \"Save session now\"."
                                        }
                                    }
                                }
                            }
                            loadUrl(loginUrl)
                        }
                    },
                )
                Spacer(Modifier.height(8.dp))
                SessionDialogFooter(
                    onSaveNow = {
                        val raw = collectCookiesForOrigin(origin)
                        if (raw.isEmpty()) {
                            status = "No cookies stored yet. Complete login in the web view first."
                        } else {
                            onCaptured(raw)
                        }
                    },
                    onDismiss = onDismiss,
                )
            }
        }
    }
}

@Composable
private fun SessionDialogFooter(
    onSaveNow: () -> Unit,
    onDismiss: () -> Unit,
) {
    Column {
        Button(
            onClick = onSaveNow,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Save session now")
        }
        Spacer(Modifier.height(4.dp))
        TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
            Text("Cancel")
        }
    }
}
