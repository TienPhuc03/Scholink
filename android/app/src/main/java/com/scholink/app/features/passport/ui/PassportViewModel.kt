package com.scholink.app.features.passport.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.scholink.app.features.passport.data.PassportApi
import com.scholink.app.features.passport.domain.model.PassportDetail
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PassportUiState(
    val isLoading: Boolean = false,
    val passport: PassportDetail? = null,
    val error: String? = null
)

class PassportViewModel(
    private val passportApi: PassportApi
) : ViewModel() {

    private val _uiState = MutableStateFlow(PassportUiState(isLoading = true))
    val uiState: StateFlow<PassportUiState> = _uiState.asStateFlow()

    init {
        loadPassport()
    }

    fun loadPassport() {
        viewModelScope.launch {
            _uiState.value = PassportUiState(isLoading = true)
            try {
                val response = passportApi.getMyPassport()
                if (response.isSuccessful && response.body() != null) {
                    _uiState.value = PassportUiState(passport = response.body())
                } else {
                    _uiState.value = PassportUiState(error = "Không thể tải thông tin Passport")
                }
            } catch (e: Exception) {
                _uiState.value = PassportUiState(error = e.localizedMessage ?: "Lỗi kết nối")
            }
        }
    }
}
