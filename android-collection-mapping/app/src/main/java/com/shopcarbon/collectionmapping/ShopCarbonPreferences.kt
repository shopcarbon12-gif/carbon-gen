package com.shopcarbon.collectionmapping

import android.content.Context
import android.content.SharedPreferences

/** Cookie header must be one line; remove line breaks from pastes or soft-wrapped text fields. */
private fun normalizeSessionCookieHeader(value: String): String =
    value.trim().replace("\r\n", "").replace("\r", "").replace("\n", "")

class ShopCarbonPreferences(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var apiBaseUrl: String
        get() = prefs.getString(KEY_API, null)?.trim().orEmpty().ifEmpty {
            BuildConfig.API_BASE_URL.trim().trimEnd('/')
        }
        set(value) {
            prefs.edit().putString(KEY_API, value.trim().trimEnd('/')).apply()
        }

    var shopDomain: String
        get() = prefs.getString(KEY_SHOP, null)?.trim().orEmpty().ifEmpty {
            BuildConfig.SHOPIFY_SHOP_DOMAIN.trim()
        }
        set(value) {
            prefs.edit().putString(KEY_SHOP, value.trim()).apply()
        }

    /** Raw `Cookie` header value (e.g. paste from browser DevTools Application → Cookies). */
    var sessionCookie: String
        get() = normalizeSessionCookieHeader(prefs.getString(KEY_COOKIE, null)?.trim().orEmpty())
        set(value) {
            prefs.edit().putString(KEY_COOKIE, normalizeSessionCookieHeader(value)).apply()
        }

    companion object {
        private const val PREFS_NAME = "shopcarbon_mapping"
        private const val KEY_API = "api_base_url"
        private const val KEY_SHOP = "shop_domain"
        private const val KEY_COOKIE = "session_cookie"
    }
}
