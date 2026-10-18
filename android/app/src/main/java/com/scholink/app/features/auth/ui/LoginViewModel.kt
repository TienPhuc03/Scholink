package com.scholink.app.features.auth.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.scholink.app.core.common.Resource
import com.scholink.app.core.datastore.SecureTokenStorage
import com.scholink.app.features.auth.data.AuthApi
import com.scholink.app.features.auth.domain.model.LoginRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LoginUiState(
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

class LoginViewModel(
    private val authApi: AuthApi,
    private val tokenStorage: SecureTokenStorage
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.value = LoginUiState(isLoading = true)
            try {
                val response = authApi.login(LoginRequest(email, password))
                if (response.isSuccessful && response.body() != null) {
                    val auth = response.body()!!
                    tokenStorage.saveTokens(auth.accessToken, auth.refreshToken)
                    _uiState.value = LoginUiState(isSuccess = true)
                } else {
                    _uiState.value = LoginUiState(error = "Email hoặc mật khẩu không chính xác")
                }
            } catch (e: Exception) {
                _uiState.value = LoginUiState(error = e.localizedMessage ?: "Không thể kết nối đến máy chủ")
            }
        }
    }
}
