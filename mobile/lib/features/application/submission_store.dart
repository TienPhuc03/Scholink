import '../../core/database/local_cache_manager.dart';

/// One submission attempt for an opportunity, kept on the device so retries after a lost
/// response, an app kill or a crash never create a second application (Q5, F19 / APP-01).
///
/// - [submissionId] stays the same for the whole attempt, across new previews.
/// - [idempotencyKey] + [body] are the last `POST /applications` request. The backend caches the
///   outcome per key for 24 h and rejects the same key with a different body, so a retry must
///   resend this exact pair; a new preview/consent produces a new body and therefore a new key.
class PendingSubmission {
  final String opportunityId;
  final String submissionId;
  final DateTime createdAt;
  final String? idempotencyKey;
  final Map<String, dynamic>? body;

  const PendingSubmission({
    required this.opportunityId,
    required this.submissionId,
    required this.createdAt,
    this.idempotencyKey,
    this.body,
  });

  /// Matches the backend idempotency TTL (24 h).
  static const Duration ttl = Duration(hours: 24);

  bool isExpired(DateTime now) => now.difference(createdAt) > ttl;

  bool get hasSentRequest => idempotencyKey != null && body != null;

  PendingSubmission withRequest({required String idempotencyKey, required Map<String, dynamic> body}) =>
      PendingSubmission(
        opportunityId: opportunityId,
        submissionId: submissionId,
        createdAt: createdAt,
        idempotencyKey: idempotencyKey,
        body: body,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'opportunityId': opportunityId,
        'submissionId': submissionId,
        'createdAt': createdAt.toUtc().toIso8601String(),
        if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
        if (body != null) 'body': body,
      };

  static PendingSubmission? fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) return null;
    final String? opp = json['opportunityId'] as String?;
    final String? sub = json['submissionId'] as String?;
    final DateTime? created = DateTime.tryParse((json['createdAt'] as String?) ?? '');
    if (opp == null || sub == null || created == null) return null;
    final dynamic body = json['body'];
    return PendingSubmission(
      opportunityId: opp,
      submissionId: sub,
      createdAt: created,
      idempotencyKey: json['idempotencyKey'] as String?,
      body: body is Map<String, dynamic> ? body : null,
    );
  }
}

/// Persists [PendingSubmission]s in the local cache, one per opportunity.
class SubmissionStore {
  final LocalCacheManager _cache;
  final DateTime Function() _clock;

  SubmissionStore(this._cache, {DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  static String _key(String opportunityId) => 'apply.pending.$opportunityId';

  /// Returns the live attempt for this opportunity; expired ones are dropped.
  Future<PendingSubmission?> load(String opportunityId) async {
    try {
      final PendingSubmission? p = PendingSubmission.fromJson(await _cache.getJson(_key(opportunityId)));
      if (p == null) return null;
      if (p.isExpired(_clock())) {
        await clear(opportunityId);
        return null;
      }
      return p;
    } catch (_) {
      return null;
    }
  }

  Future<void> save(PendingSubmission p) => _cache.saveJson(_key(p.opportunityId), p.toJson());

  Future<void> clear(String opportunityId) => _cache.remove(_key(opportunityId));
}
