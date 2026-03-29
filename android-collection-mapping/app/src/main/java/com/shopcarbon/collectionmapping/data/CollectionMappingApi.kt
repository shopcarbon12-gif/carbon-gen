package com.shopcarbon.collectionmapping.data

import com.google.gson.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface CollectionMappingApi {
    @POST("api/collection-mapping")
    suspend fun postCollectionMapping(@Body body: JsonObject): JsonObject

    @GET("api/collection-mapping")
    suspend fun getCollectionMapping(
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int,
        @Query("q") q: String,
        @Query("sortField") sortField: String,
        @Query("sortDir") sortDir: String,
        @Query("shop") shop: String?,
        @Query("refreshProducts") refreshProducts: Boolean? = null,
        @Query("refreshCollections") refreshCollections: Boolean? = null,
    ): MappingGetResponse
}
