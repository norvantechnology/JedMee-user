import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';

class PaymentRepository {
  PaymentRepository(this._client);

  final ApiClient _client;

  Future<ApiResponse> listCustomerPayments([Map<String, dynamic>? params]) =>
      _client.get('/customer-payments', params: params);

  Future<ApiResponse> listVendorPayments([Map<String, dynamic>? params]) =>
      _client.get('/vendor-payments', params: params);

  Future<ApiResponse> listDivisionPayments([Map<String, dynamic>? params]) =>
      _client.get('/division-payments', params: params);

  Future<ApiResponse> createCustomerPayment([Map<String, dynamic>? payload]) =>
      _client.post('/customer-payments', payload ?? {});

  Future<ApiResponse> createVendorPayment([Map<String, dynamic>? payload]) =>
      _client.post('/vendor-payments', payload ?? {});

  Future<ApiResponse> createDivisionPayment([Map<String, dynamic>? payload]) =>
      _client.post('/division-payments', payload ?? {});

  Future<ApiResponse> bulkSettleCustomerPayments([Map<String, dynamic>? payload]) =>
      _client.post('/customer-payments/bulk-settle', payload ?? {});

  Future<ApiResponse> bulkSettleVendorPayments([Map<String, dynamic>? payload]) =>
      _client.post('/vendor-payments/bulk-settle', payload ?? {});
}
