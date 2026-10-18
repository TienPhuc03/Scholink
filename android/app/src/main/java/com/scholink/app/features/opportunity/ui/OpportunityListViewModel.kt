package com.scholink.app.features.opportunity.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.scholink.app.core.database.dao.OpportunityDao
import com.scholink.app.core.database.entity.OpportunityEntity
import com.scholink.app.features.opportunity.data.OpportunityApi
import com.scholink.app.features.opportunity.domain.model.OpportunityItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class OpportunityListUiState(
    val isLoading: Boolean = false,
    val items: List<OpportunityItem> = emptyList(),
    val selectedFilter: String = "ALL", // ALL, SCHOLARSHIP, COMPETITION
    val error: String? = null
)

class OpportunityListViewModel(
    private val api: OpportunityApi,
    private val dao: OpportunityDao
) : ViewModel() {

    private val _uiState = MutableStateFlow(OpportunityListUiState(isLoading = true))
    val uiState: StateFlow<OpportunityListUiState> = _uiState.asStateFlow()

    init {
        loadOpportunities()
    }

    fun setFilter(filter: String) {
        _uiState.value = _uiState.value.copy(selectedFilter = filter)
        loadOpportunities()
    }

    fun loadOpportunities() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val typeParam = when (_uiState.value.selectedFilter) {
                "SCHOLARSHIP" -> "SCHOLARSHIP"
                "COMPETITION" -> "COMPETITION"
                else -> null
            }

            try {
                val response = api.getOpportunities(type = typeParam)
                if (response.isSuccessful && response.body() != null) {
                    val list = response.body()!!.items
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        items = list
                    )

                    // Cache to Room DB for offline viewing (Section 33)
                    val entities = list.map { item ->
                        OpportunityEntity(
                            id = item.id,
                            type = item.type,
                            title = item.title,
                            description = item.description,
                            organizerName = item.organizerName,
                            applyMode = item.applyMode,
                            registerDeadline = item.registerDeadline,
                            submitDeadline = item.submitDeadline
                        )
                    }
                    dao.insertAll(entities)
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Không thể tải danh sách cơ hội"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Không có kết nối mạng, hiển thị bản lưu offline"
                )
            }
        }
    }
}
