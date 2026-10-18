package com.scholink.app.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cached_opportunities")
data class OpportunityEntity(
    @PrimaryKey
    val id: String,
    val type: String,
    val title: String,
    val description: String,
    val organizerName: String,
    val applyMode: String,
    val registerDeadline: String,
    val submitDeadline: String?,
    val isBookmarked: Boolean = false,
    val cachedAt: Long = System.currentTimeMillis()
)
