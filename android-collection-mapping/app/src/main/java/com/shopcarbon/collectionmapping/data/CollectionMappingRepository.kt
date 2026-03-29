package com.shopcarbon.collectionmapping.data

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.shopcarbon.collectionmapping.BuildConfig
import com.shopcarbon.collectionmapping.ShopCarbonPreferences
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class CollectionMappingRepository(
    private val preferences: ShopCarbonPreferences,
) {
    private var retrofit: Retrofit? = null
    private var clientKey: String = ""

    private fun effectiveShop(explicit: String?): String? =
        explicit?.trim()?.takeIf { it.isNotEmpty() }
            ?: preferences.shopDomain.trim().takeIf { it.isNotEmpty() }

    private fun ensureApi(): CollectionMappingApi {
        val base = preferences.apiBaseUrl.trim().trimEnd('/')
        val cookie = preferences.sessionCookie.trim()
        val key = "$base|$cookie"
        if (retrofit == null || key != clientKey) {
            clientKey = key
            val normalized = if (base.endsWith("/")) base else "$base/"
            val logging = HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) {
                    HttpLoggingInterceptor.Level.BASIC
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            }
            val clientBuilder = OkHttpClient.Builder()
                .connectTimeout(120, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .writeTimeout(120, TimeUnit.SECONDS)
                .addInterceptor(logging)
            if (cookie.isNotEmpty()) {
                clientBuilder.addInterceptor { chain ->
                    val req = chain.request().newBuilder().header("Cookie", cookie).build()
                    chain.proceed(req)
                }
            }
            retrofit = Retrofit.Builder()
                .baseUrl(normalized)
                .client(clientBuilder.build())
                .addConverterFactory(GsonConverterFactory.create())
                .build()
        }
        return retrofit!!.create(CollectionMappingApi::class.java)
    }

    suspend fun loadMapping(
        page: Int = 1,
        pageSize: Int = 50,
        search: String = "",
        sortField: String = "title",
        sortDir: String = "asc",
        shop: String? = null,
        refreshProducts: Boolean = false,
        refreshCollections: Boolean = false,
    ): Result<MappingGetResponse> = runCatching {
        val resp = ensureApi().getCollectionMapping(
            page = page,
            pageSize = pageSize.coerceIn(1, 500),
            q = search,
            sortField = sortField,
            sortDir = sortDir,
            shop = effectiveShop(shop),
            refreshProducts = refreshProducts.takeIf { it },
            refreshCollections = refreshCollections.takeIf { it },
        )
        if (!resp.ok) {
            error(resp.error ?: "Collection mapping request failed.")
        }
        resp
    }

    suspend fun postJson(body: JsonObject): JsonObject = ensureApi().postCollectionMapping(body)

    suspend fun setRowDraftBatch(
        shop: String?,
        drafts: List<Pair<String, JsonObject>>,
    ): Result<Unit> = runCatching {
        if (drafts.isEmpty()) return@runCatching
        val body = JsonObject().apply {
            addProperty("action", "set-row-draft-batch")
            effectiveShop(shop)?.let { addProperty("shop", it) }
            val arr = JsonArray()
            for ((rowId, draft) in drafts) {
                val entry = JsonObject()
                entry.addProperty("rowId", rowId)
                entry.add("draft", draft)
                arr.add(entry)
            }
            add("drafts", arr)
        }
        val json = postJson(body)
        val ok = json.get("ok")?.asBoolean ?: false
        if (!ok) {
            error(json.get("error")?.asString ?: "Save draft failed.")
        }
    }
}
