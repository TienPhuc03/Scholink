import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/application/apply_viewmodel.dart';
import 'package:scholink_mobile/features/application/attachment_model.dart';

import '../auth/auth_test_fakes.dart';
import 'apply_test_support.dart';

Future<ApplyViewModel> toReview(ApplyHarness h) async {
  final ApplyViewModel vm = h.build();
  await vm.start();
  vm.goToAttachments();
  await vm.goToReview();
  return vm;
}

void main() {
  group('Step 1 – readiness (Q4)', () {
    test('INELIGIBLE blocks the flow', () async {
      final ApplyHarness h = ApplyHarness()..api.reply(ApiEndpoints.readiness, readinessBody(screening: 'INELIGIBLE'));
      final ApplyViewModel vm = h.build();
      await vm.start();
      expect(vm.readiness!.canProceed, isFalse);
      vm.goToAttachments();
      expect(vm.step, ApplyStep.readiness);
      vm.dispose();
    });

    test('missing Passport fields block the flow', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(ApiEndpoints.readiness, readinessBody(missing: <String>['education']));
      final ApplyViewModel vm = h.build();
      await vm.start();
      vm.goToAttachments();
      expect(vm.step, ApplyStep.readiness);
      expect(vm.readiness!.missingFields, <String>['education']);
      vm.dispose();
    });

    test('NEEDS_REVIEW may continue', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(ApiEndpoints.readiness, readinessBody(screening: 'NEEDS_REVIEW'));
      final ApplyViewModel vm = h.build();
      await vm.start();
      vm.goToAttachments();
      expect(vm.step, ApplyStep.attachments);
      vm.dispose();
    });

    test('an active application for this opportunity skips the flow (Q15)', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(ApiEndpoints.myApplications, <Map<String, dynamic>>[
          <String, dynamic>{'id': 'app_old', 'opportunityId': oppId, 'status': 'REVIEWING', 'submissionType': 'INDIVIDUAL'},
        ]);
      final ApplyViewModel vm = h.build();
      await vm.start();
      expect(vm.existingApplication?.id, 'app_old');
      expect(h.api.callsTo(ApiEndpoints.readiness), isEmpty);
      vm.dispose();
    });

    test('a cancelled application stops the flow, as the backend refuses to resubmit it', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(ApiEndpoints.myApplications, <Map<String, dynamic>>[
          <String, dynamic>{'id': 'app_old', 'opportunityId': oppId, 'status': 'CANCELLED', 'submissionType': 'INDIVIDUAL'},
        ]);
      final ApplyViewModel vm = h.build();
      await vm.start();
      expect(vm.existingApplication?.id, 'app_old');
      vm.dispose();
    });

    test('a withdrawn application does not block a new one', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(ApiEndpoints.myApplications, <Map<String, dynamic>>[
          <String, dynamic>{'id': 'app_old', 'opportunityId': oppId, 'status': 'WITHDRAWN'},
        ]);
      final ApplyViewModel vm = h.build();
      await vm.start();
      expect(vm.existingApplication, isNull);
      vm.dispose();
    });
  });

  group('Step 2 – attachments (Q3/Q10)', () {
    test('rejects wrong type, oversize and renamed files locally without calling the server', () async {
      final ApplyHarness h = ApplyHarness();
      final ApplyViewModel vm = h.build();
      await vm.start();
      vm.goToAttachments();

      h.picker.queue.add(PickedAttachment(name: 'notes.docx', bytes: Uint8List.fromList(<int>[1, 2, 3, 4])));
      await vm.pickAttachment();
      expect(vm.attachmentError, contains('Chỉ nhận tệp PDF'));

      h.picker.queue.add(PickedAttachment(name: 'photo.jpg', bytes: Uint8List.fromList(<int>[0xFF, 0xD8, 0xFF, 0])));
      await vm.pickAttachment();
      expect(vm.attachmentError, contains('Chỉ nhận tệp PDF'));

      h.picker.queue.add(pdf('big.pdf', size: AttachmentRules.maxBytes + 1));
      await vm.pickAttachment();
      expect(vm.attachmentError, contains('5 MB'));

      h.picker.queue.add(PickedAttachment(name: 'fake.pdf', bytes: Uint8List.fromList(<int>[0x89, 0x50, 0x4E, 0x47, 0])));
      await vm.pickAttachment();
      expect(vm.attachmentError, contains('không khớp'));

      expect(vm.attachments, isEmpty);
      expect(h.api.callsTo(ApiEndpoints.mediaUploadUrl), isEmpty);
      vm.dispose();
    });

    test('a valid PDF goes through upload-url + complete and becomes READY', () async {
      final ApplyHarness h = ApplyHarness();
      final ApplyViewModel vm = h.build();
      await vm.start();
      vm.goToAttachments();
      h.picker.queue.add(pdf('cv.pdf'));
      await vm.pickAttachment();

      expect(vm.attachments.single.state, AttachmentState.ready);
      final RecordedCall upload = h.api.callsTo(ApiEndpoints.mediaUploadUrl).single;
      expect(upload.data['category'], 'ATTACHMENT');
      expect((upload.data['sha256'] as String).length, 64);
      expect(h.api.callsTo(ApiEndpoints.mediaComplete('ast_1')).single.data['fileHeaderHex'], startsWith('25504446'));

      await vm.goToReview();
      expect(h.api.callsTo(ApiEndpoints.applicationPreviews).single.data['attachmentIds'], <String>['ast_1']);
      vm.dispose();
    });

    test('a file rejected by the scan is shown with its reason', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(
          ApiEndpoints.mediaComplete('ast_1'),
          const ServerFailure(message: 'Phát hiện mã độc', code: 'MALICIOUS_FILE_DETECTED', statusCode: 422),
        );
      final ApplyViewModel vm = h.build();
      await vm.start();
      vm.goToAttachments();
      h.picker.queue.add(pdf('virus.pdf'));
      await vm.pickAttachment();
      expect(vm.attachments.single.state, AttachmentState.rejected);
      expect(vm.attachments.single.error, 'Phát hiện mã độc');
      vm.dispose();
    });
  });

  group('Step 3 – preview, consent, submit', () {
    test('submit stays disabled until consent is ticked', () async {
      final ApplyHarness h = ApplyHarness();
      final ApplyViewModel vm = await toReview(h);
      expect(vm.preview, isNotNull);
      expect(vm.canSubmit, isFalse);
      vm.setConsent(true);
      expect(vm.canSubmit, isTrue);
      vm.dispose();
    });

    test('happy path: consent (SNAPSHOT only) then submit with an Idempotency-Key, store cleared', () async {
      final ApplyHarness h = ApplyHarness();
      final ApplyViewModel vm = await toReview(h);
      vm.setConsent(true);
      await vm.submit();

      expect(vm.result?.applicationId, 'app_1');
      expect(h.api.callsTo(ApiEndpoints.consents).single.data['scope'], <String>['SNAPSHOT']);
      final RecordedCall submit = h.submits.single;
      expect(submit.headers['Idempotency-Key'], isNotEmpty);
      expect(submit.data['consentId'], 'cns_1');
      expect(submit.data['submissionType'], 'INDIVIDUAL');
      expect(h.cache.store, isEmpty);
      vm.dispose();
    });

    test('lost response: retry resends the identical body and key, even after an app restart', () async {
      final ApplyHarness h = ApplyHarness()..api.reply(ApiEndpoints.applications, const NetworkFailure());
      final ApplyViewModel vm = await toReview(h);
      vm.setConsent(true);
      await vm.submit();
      expect(vm.canRetrySubmit, isTrue);

      await vm.retrySubmit();
      expect(h.submits.length, 2);
      expect(h.submits[1].headers['Idempotency-Key'], h.submits[0].headers['Idempotency-Key']);
      expect(h.submits[1].data, h.submits[0].data);
      vm.dispose();

      // Simulated crash: a brand new view model reading the same device store.
      h.api.reply(ApiEndpoints.applications, submitOk());
      final ApplyViewModel reopened = h.build();
      await reopened.start();
      expect(reopened.hasUnconfirmedAttempt, isTrue);
      await reopened.retrySubmit();
      expect(h.submits.length, 3);
      expect(h.submits[2].headers['Idempotency-Key'], h.submits[0].headers['Idempotency-Key']);
      expect(reopened.result?.applicationId, 'app_1');
      reopened.dispose();
    });

    test('expired preview blocks submit; a new preview keeps submissionId but uses a new key', () async {
      final ApplyHarness h = ApplyHarness()..api.reply(ApiEndpoints.applications, const NetworkFailure());
      final ApplyViewModel vm = await toReview(h);
      vm.setConsent(true);
      await vm.submit();
      final String firstKey = h.submits.single.headers['Idempotency-Key'] as String;
      final String submissionId = h.submits.single.data['submissionId'] as String;

      h.now = h.now.add(const Duration(minutes: 11));
      expect(vm.previewExpired, isTrue);
      expect(vm.canSubmit, isFalse);

      h.api.handlers[ApiEndpoints.applicationPreviews] = (RecordedCall c) =>
          previewBody(c, previewId: 'prv_2', expiresAt: h.now.add(const Duration(minutes: 10)));
      h.api.reply(ApiEndpoints.applications, submitOk());
      await vm.createPreview();
      expect(vm.consentAccepted, isFalse, reason: 'a new preview needs a new consent (Q9)');
      vm.setConsent(true);
      await vm.submit();

      expect(h.submits.last.data['submissionId'], submissionId);
      expect(h.submits.last.data['previewId'], 'prv_2');
      expect(h.submits.last.headers['Idempotency-Key'], isNot(firstKey));
      vm.dispose();
    });

    test('PREVIEW_EXPIRED from the server marks the preview stale', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(
          ApiEndpoints.applications,
          const ServerFailure(message: 'Bản xem trước đã hết hạn.', code: 'PREVIEW_EXPIRED', statusCode: 410),
        );
      final ApplyViewModel vm = await toReview(h);
      vm.setConsent(true);
      await vm.submit();
      expect(vm.previewStale, isTrue);
      expect(vm.needsNewPreview, isTrue);
      expect(vm.canRetrySubmit, isFalse);
      vm.dispose();
    });

    test('SNAPSHOT_STALE when consenting asks for a new preview instead of resubmitting', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(
          ApiEndpoints.consents,
          const ServerFailure(message: 'Hồ sơ Passport đã thay đổi', code: 'SNAPSHOT_STALE', statusCode: 409),
        );
      final ApplyViewModel vm = await toReview(h);
      vm.setConsent(true);
      await vm.submit();
      expect(vm.previewStale, isTrue);
      expect(vm.needsNewPreview, isTrue);
      expect(vm.canSubmit, isFalse);
      expect(vm.submitError, 'Hồ sơ Passport đã thay đổi');
      vm.dispose();
    });

    test('ASSET_NOT_AVAILABLE returns to the attachments step', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(
          ApiEndpoints.applications,
          const ServerFailure(message: 'Tệp không còn sẵn sàng', code: 'ASSET_NOT_AVAILABLE', statusCode: 409),
        );
      final ApplyViewModel vm = await toReview(h);
      vm.setConsent(true);
      await vm.submit();
      expect(vm.step, ApplyStep.attachments);
      expect(vm.attachmentError, 'Tệp không còn sẵn sàng');
      expect(vm.preview, isNull);
      expect(vm.canRetrySubmit, isFalse);
      vm.dispose();
    });

    test('ALREADY_APPLIED shows the existing application instead of retrying', () async {
      final ApplyHarness h = ApplyHarness()
        ..api.reply(
          ApiEndpoints.applications,
          const ServerFailure(message: 'Bạn đã nộp hồ sơ cho cơ hội này', code: 'ALREADY_APPLIED', statusCode: 409),
        );
      final ApplyViewModel vm = await toReview(h);
      vm.setConsent(true);
      h.api.reply(ApiEndpoints.myApplications, <Map<String, dynamic>>[
        <String, dynamic>{'id': 'app_other_device', 'opportunityId': oppId, 'status': 'SUBMITTED'},
      ]);
      await vm.submit();
      expect(vm.existingApplication?.id, 'app_other_device');
      expect(h.cache.store, isEmpty);
      vm.dispose();
    });
  });
}
