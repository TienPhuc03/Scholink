package com.scholink.app.features.opportunity.domain.model

data class OpportunityItem(
    val id: String,
    val type: String, // SCHOLARSHIP or COMPETITION
    val title: String,
    val description: String,
    val organizerName: String,
    val applyMode: String,
    val registerDeadline: String,
    val submitDeadline: String?,
    val fundingLevel: String?,
    val competitionMode: String?,
    val tags: List<String>?
)

data class OpportunityListResponse(
    val items: List<OpportunityItem>,
    val nextCursor: String?,
    val hasMore: Boolean
)
