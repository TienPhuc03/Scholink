import 'dart:async';
import 'dart:math';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

enum CallType {
  audio,
  video,
}

enum CallStatus {
  ringing,
  calling,
  connected,
  ended,
}

/// Direct Calling View (1-on-1 and Group Direct Voice & Video Call)
/// Supports audio/video toggling, camera switching, live audio visualizer,
/// call duration timer, and incoming/outgoing call states.
class DirectCallView extends StatefulWidget {
  final String roomName;
  final String? roomId;
  final CallType initialType;
  final bool isIncoming;
  final String? callerName;
  final void Function(int durationSeconds, CallType callType)? onCallEnded;

  const DirectCallView({
    super.key,
    required this.roomName,
    this.roomId,
    this.initialType = CallType.video,
    this.isIncoming = false,
    this.callerName,
    this.onCallEnded,
  });

  @override
  State<DirectCallView> createState() => _DirectCallViewState();
}

class _DirectCallViewState extends State<DirectCallView>
    with TickerProviderStateMixin {
  // Call States
  late CallType _currentType;
  late CallStatus _callStatus;
  int _callDurationSeconds = 0;
  Timer? _callDurationTimer;
  Timer? _autoConnectTimer;
  Timer? _exitTimer;

  // Audio / Device Controls
  bool _isMuted = false;
  bool _isSpeakerOn = true;
  bool _isVideoEnabled = true;
  bool _isFrontCamera = true;

  // Camera Management
  List<CameraDescription> _cameras = <CameraDescription>[];
  CameraController? _cameraController;
  int _selectedCameraIndex = 0;
  bool _isCameraInitialized = false;
  String? _cameraErrorMessage;

  // Animations
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  late AnimationController _waveController;

  @override
  void initState() {
    super.initState();
    _currentType = widget.initialType;
    _isVideoEnabled = widget.initialType == CallType.video;
    _callStatus =
        widget.isIncoming ? CallStatus.ringing : CallStatus.calling;

    // Pulse animation for ringing / speaking aura
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.2).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // Audio visualizer wave animation
    _waveController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat();

    // Initialize Camera if Video Call
    if (_isVideoEnabled) {
      _initializeCamera();
    }

    // Auto-connect outgoing call after 2.5 seconds (simulate other party answering)
    if (!widget.isIncoming) {
      _autoConnectTimer = Timer(const Duration(milliseconds: 2500), () {
        if (mounted && _callStatus == CallStatus.calling) {
          _acceptCall();
        }
      });
    }
  }

  void _acceptCall() {
    _autoConnectTimer?.cancel();
    setState(() {
      _callStatus = CallStatus.connected;
    });
    _startCallTimer();
  }

  void _startCallTimer() {
    _callDurationTimer?.cancel();
    _callDurationTimer =
        Timer.periodic(const Duration(seconds: 1), (Timer timer) {
      if (mounted) {
        setState(() {
          _callDurationSeconds++;
        });
      }
    });
  }

  String _formatDuration(int seconds) {
    final int minutes = seconds ~/ 60;
    final int remainingSeconds = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${remainingSeconds.toString().padLeft(2, '0')}';
  }

  Future<void> _initializeCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        if (mounted) {
          setState(() {
            _cameraErrorMessage =
                'Không tìm thấy thiết bị camera khả dụng.';
          });
        }
        return;
      }

      int initialIndex = _cameras.indexWhere(
        (CameraDescription c) =>
            c.lensDirection == CameraLensDirection.front,
      );
      if (initialIndex == -1) {
        initialIndex = 0;
      }

      _selectedCameraIndex = initialIndex;
      await _setupCameraController(_cameras[_selectedCameraIndex]);
    } catch (e) {
      if (mounted) {
        setState(() {
          _cameraErrorMessage = 'Không thể truy cập camera: $e';
        });
      }
    }
  }

  Future<void> _setupCameraController(CameraDescription camera) async {
    final CameraController controller = CameraController(
      camera,
      ResolutionPreset.medium,
      enableAudio: true,
    );

    try {
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }

      setState(() {
        _cameraController = controller;
        _isCameraInitialized = true;
        _isFrontCamera =
            camera.lensDirection == CameraLensDirection.front;
        _cameraErrorMessage = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _cameraErrorMessage = 'Lỗi khởi tạo camera: $e';
          _isCameraInitialized = false;
        });
      }
    }
  }

  Future<void> _toggleCamera() async {
    if (_cameras.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Thiết bị chỉ có 1 camera.'),
          duration: Duration(seconds: 1),
        ),
      );
      return;
    }

    final int nextIndex = (_selectedCameraIndex + 1) % _cameras.length;
    _selectedCameraIndex = nextIndex;

    await _cameraController?.dispose();
    setState(() {
      _isCameraInitialized = false;
    });

    await _setupCameraController(_cameras[_selectedCameraIndex]);
  }

  void _toggleMute() {
    setState(() {
      _isMuted = !_isMuted;
    });
  }

  void _toggleSpeaker() {
    setState(() {
      _isSpeakerOn = !_isSpeakerOn;
    });
  }

  Future<void> _toggleVideo() async {
    if (_isVideoEnabled) {
      _switchToAudioCall();
    } else {
      _switchToVideoCall();
    }
  }

  void _switchToVideoCall() async {
    setState(() {
      _currentType = CallType.video;
      _isVideoEnabled = true;
    });
    if (!_isCameraInitialized) {
      await _initializeCamera();
    }
  }

  void _switchToAudioCall() {
    setState(() {
      _currentType = CallType.audio;
      _isVideoEnabled = false;
    });
  }

  void _endCall() {
    _autoConnectTimer?.cancel();
    _callDurationTimer?.cancel();
    _exitTimer?.cancel();
    widget.onCallEnded?.call(_callDurationSeconds, _currentType);

    setState(() {
      _callStatus = CallStatus.ended;
    });

    _exitTimer = Timer(const Duration(milliseconds: 300), () {
      if (mounted) {
        Navigator.of(context).maybePop();
      }
    });
  }

  @override
  void dispose() {
    _autoConnectTimer?.cancel();
    _callDurationTimer?.cancel();
    _exitTimer?.cancel();
    _pulseController.dispose();
    _waveController.dispose();
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: <Widget>[
          // 1. BACKGROUND / VIDEO STREAM
          if (_currentType == CallType.video && _isVideoEnabled)
            Positioned.fill(child: _buildVideoFeed())
          else
            Positioned.fill(child: _buildAudioAmbientBackground()),

          // 2. GRADIENT VIGNETTES
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 160,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: <Color>[Color(0xE60F172A), Colors.transparent],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 220,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: <Color>[Colors.transparent, Color(0xF00F172A)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),

          // 3. TOP APP BAR & STATUS
          SafeArea(
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Row(
                children: <Widget>[
                  IconButton(
                    icon: const Icon(Icons.keyboard_arrow_down_rounded,
                        color: Colors.white, size: 30),
                    onPressed: _endCall,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(
                          widget.roomName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: <Widget>[
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: _callStatus == CallStatus.connected
                                    ? const Color(0xFF10B981)
                                    : const Color(0xFFF59E0B),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              _getStatusLabel(),
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                _currentType == CallType.video
                                    ? 'HD 1080p'
                                    : 'HD Voice',
                                style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (_currentType == CallType.video)
                    IconButton(
                      icon: const Icon(Icons.flip_camera_ios_rounded,
                          color: Colors.white),
                      tooltip: _isFrontCamera
                          ? 'Đổi sang camera sau'
                          : 'Đổi sang camera trước',
                      onPressed: _toggleCamera,
                    ),
                ],
              ),
            ),
          ),

          // 4. FLOATING PIP (When in Video Call)
          if (_currentType == CallType.video &&
              _callStatus == CallStatus.connected)
            Positioned(
              top: 100,
              right: 16,
              child: _buildFloatingPip(),
            ),

          // 5. CENTER CONTENT (Avatar + Visualizer for Audio, or Calling State)
          if (_currentType == CallType.audio ||
              _callStatus != CallStatus.connected ||
              !_isVideoEnabled)
            Center(
              child: _buildCenterAudioContent(),
            ),

          // 6. BOTTOM CONTROLS
          Positioned(
            bottom: 36,
            left: 0,
            right: 0,
            child: _buildBottomControls(),
          ),
        ],
      ),
    );
  }

  String _getStatusLabel() {
    switch (_callStatus) {
      case CallStatus.ringing:
        return 'Đang đổ chuông...';
      case CallStatus.calling:
        return 'Đang gọi trực tiếp...';
      case CallStatus.connected:
        return _formatDuration(_callDurationSeconds);
      case CallStatus.ended:
        return 'Đã kết thúc';
    }
  }

  // =========================================================================
  // SUB-WIDGETS & SECTIONS
  // =========================================================================

  Widget _buildAudioAmbientBackground() {
    return Container(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0.0, -0.2),
          radius: 1.2,
          colors: <Color>[
            Color(0xFF312E81), // Deep Indigo
            Color(0xFF1E1B4B),
            Color(0xFF0F172A), // Dark Slate
          ],
        ),
      ),
    );
  }

  Widget _buildVideoFeed() {
    if (_isCameraInitialized && _cameraController != null) {
      return Center(
        child: CameraPreview(_cameraController!),
      );
    }

    return Container(
      color: const Color(0xFF111827),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: 90,
              height: 90,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(
                  colors: <Color>[AppColors.primary, Color(0xFF1E1B4B)],
                ),
                border: Border.all(color: Colors.white24, width: 2),
              ),
              child: const Icon(Icons.videocam_rounded,
                  size: 42, color: Colors.white),
            ),
            const SizedBox(height: 16),
            Text(
              _cameraErrorMessage ?? 'Đang kết nối camera trực tiếp...',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCenterAudioContent() {
    final String initial = widget.roomName.isNotEmpty
        ? widget.roomName.substring(0, min(2, widget.roomName.length)).toUpperCase()
        : 'SK';

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        // Pulsing Avatar with Rings
        AnimatedBuilder(
          animation: _pulseAnimation,
          builder: (BuildContext context, Widget? child) {
            final double scale = _callStatus == CallStatus.connected
                ? (_isMuted ? 1.0 : _pulseAnimation.value)
                : _pulseAnimation.value;
            return Stack(
              alignment: Alignment.center,
              children: <Widget>[
                // Outer Pulse Ring
                Container(
                  width: 150 * scale,
                  height: 150 * scale,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF6366F1).withValues(alpha: 0.12),
                  ),
                ),
                // Middle Pulse Ring
                Container(
                  width: 125 * scale,
                  height: 125 * scale,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF6366F1).withValues(alpha: 0.22),
                  ),
                ),
                // Main Avatar
                CircleAvatar(
                  radius: 50,
                  backgroundColor: const Color(0xFF4338CA),
                  child: Text(
                    initial,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.2,
                    ),
                  ),
                ),
                if (_callStatus == CallStatus.connected && !_isMuted)
                  Positioned(
                    bottom: 2,
                    right: 4,
                    child: Container(
                      padding: const EdgeInsets.all(5),
                      decoration: const BoxDecoration(
                        color: Color(0xFF10B981),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.mic,
                          size: 14, color: Colors.white),
                    ),
                  ),
              ],
            );
          },
        ),
        const SizedBox(height: 24),

        // Caller / Room Name
        Text(
          widget.roomName,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 22,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),

        // Status description
        Text(
          _callStatus == CallStatus.connected
              ? (_currentType == CallType.audio
                  ? 'Đang đàm thoại trực tiếp'
                  : 'Camera đang tắt')
              : (_callStatus == CallStatus.ringing
                  ? 'Cuộc gọi đến từ đồng đội'
                  : 'Đang kết nối tín hiệu...'),
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.7),
            fontSize: 14,
          ),
        ),
        const SizedBox(height: 20),

        // Animated Audio Waveform (When Connected & Audio Mode)
        if (_callStatus == CallStatus.connected &&
            _currentType == CallType.audio &&
            !_isMuted)
          _buildAudioWaveVisualizer(),
      ],
    );
  }

  Widget _buildAudioWaveVisualizer() {
    return AnimatedBuilder(
      animation: _waveController,
      builder: (BuildContext context, Widget? child) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List<Widget>.generate(9, (int index) {
            final double phase = (index * 0.4) + (_waveController.value * 2 * pi);
            final double height = 10.0 + (sin(phase).abs() * 26.0);
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 2.5),
              width: 3.5,
              height: height,
              decoration: BoxDecoration(
                color: const Color(0xFF818CF8),
                borderRadius: BorderRadius.circular(4),
              ),
            );
          }),
        );
      },
    );
  }

  Widget _buildFloatingPip() {
    return Container(
      width: 100,
      height: 140,
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white30, width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Colors.black54,
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: <Widget>[
          const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                CircleAvatar(
                  radius: 20,
                  backgroundColor: Color(0xFF4338CA),
                  child: Icon(Icons.person_rounded,
                      color: Colors.white, size: 22),
                ),
                SizedBox(height: 6),
                Text(
                  'Đồng đội',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            bottom: 6,
            right: 6,
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(
                color: Color(0xFF10B981),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.mic, size: 10, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomControls() {
    // If incoming call is ringing, display Accept (Green) and Decline (Red)
    if (_callStatus == CallStatus.ringing) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: <Widget>[
          // Decline Call
          GestureDetector(
            onTap: _endCall,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Container(
                  width: 66,
                  height: 66,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEF4444),
                    shape: BoxShape.circle,
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: Color(0x66EF4444),
                        blurRadius: 14,
                        offset: Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.call_end_rounded,
                      color: Colors.white, size: 30),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Từ chối',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          // Accept Call
          GestureDetector(
            onTap: _acceptCall,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Container(
                  width: 66,
                  height: 66,
                  decoration: const BoxDecoration(
                    color: Color(0xFF10B981),
                    shape: BoxShape.circle,
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: Color(0x6610B981),
                        blurRadius: 14,
                        offset: Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.call_rounded,
                      color: Colors.white, size: 30),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Trả lời',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    // Active Connected / Calling Controls
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: <Widget>[
          // 1. Mute Audio Button
          _buildActionButton(
            icon: _isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
            label: _isMuted ? 'Bật Mic' : 'Tắt Mic',
            isActive: !_isMuted,
            onPressed: _toggleMute,
          ),

          // 2. Speaker Button (Loa ngoài / Loa trong)
          _buildActionButton(
            icon: _isSpeakerOn
                ? Icons.volume_up_rounded
                : Icons.volume_down_rounded,
            label: _isSpeakerOn ? 'Loa ngoài' : 'Loa trong',
            isActive: _isSpeakerOn,
            onPressed: _toggleSpeaker,
          ),

          // 3. Switch Video / Audio Mode
          if (_currentType == CallType.audio)
            _buildActionButton(
              icon: Icons.videocam_rounded,
              label: 'Mở Video',
              isActive: false,
              onPressed: _switchToVideoCall,
            )
          else
            _buildActionButton(
              icon: _isVideoEnabled
                  ? Icons.videocam_rounded
                  : Icons.videocam_off_rounded,
              label: _isVideoEnabled ? 'Tắt Cam' : 'Bật Cam',
              isActive: _isVideoEnabled,
              onPressed: _toggleVideo,
            ),

          // 4. End Call Button (Red)
          GestureDetector(
            onTap: _endCall,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Container(
                  width: 54,
                  height: 54,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEF4444),
                    shape: BoxShape.circle,
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: Color(0x66EF4444),
                        blurRadius: 12,
                        offset: Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.call_end_rounded,
                      color: Colors.white, size: 28),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Kết thúc',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required bool isActive,
    required VoidCallback onPressed,
  }) {
    return GestureDetector(
      onTap: onPressed,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: isActive
                  ? Colors.white.withValues(alpha: 0.2)
                  : Colors.white10,
              shape: BoxShape.circle,
              border: Border.all(
                color: isActive ? Colors.white38 : Colors.white12,
              ),
            ),
            child: Icon(
              icon,
              color: isActive ? Colors.white : Colors.white38,
              size: 24,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 11.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
