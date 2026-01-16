# Registration API Guide

This guide shows the proper usage of all registration endpoints with consistent error handling and response formats.

## ✅ All Registration Endpoints Follow This Pattern:

1. **Mongoose schema validation is consistent**
2. **Properly await save operations**
3. **Return saved document immediately**
4. **Handle JSON response for Flutter parsing**
5. **CORS configured for mobile apps**

---

## 📝 Manager Registration

### Endpoint
```
POST /api/auth/register
```

### Request Body
```json
{
  "name": "Sabi Manager",
  "email": "sabi@example.com",
  "password": "123456",
  "code": "MGR001"
}
```

### Success Response (201)
```json
{
  "success": true,
  "message": "Manager registered successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Sabi Manager",
    "email": "sabi@example.com",
    "code": "MGR001",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Error Response (400)
```json
{
  "success": false,
  "message": "Manager with this email already exists"
}
```

---

## 🚶 Field Visitor Registration

### Endpoint
```
POST /api/fieldvisitors
```

### Request Body
```json
{
  "name": "John Visitor",
  "userId": "FV001",
  "phone": "+94771234567",
  "password": "password123"
}
```

### Success Response (201)
```json
{
  "success": true,
  "message": "Field Visitor registered successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Visitor",
    "userId": "FV001",
    "phone": "+94771234567",
    "status": "active",
    "createdAt": "2025-12-16T10:30:00.000Z"
  }
}
```

### Error Response (400)
```json
{
  "success": false,
  "message": "Field Visitor with this User ID already exists"
}
```

---

## 👥 Member Registration (via server.js)

### Endpoint
```
POST /api/members
```

### Request Body
```json
{
  "id": "1734350400000",
  "fullName": "Jane Farmer",
  "mobile": "+94771234567",
  "address": "123 Farm Road, Colombo",
  "nic": "199012345678",
  "role": "Member",
  "registrationData": {
    "email": "jane@example.com",
    "land1_type": "Sinnakkara",
    "land1_size": "2.5",
    "land1_district": "Colombo",
    "land1_dsDivision": "Colombo South",
    "land1_gnDivision": "GN Division 1",
    "land1_kanna": "Maha",
    "residents": [
      {
        "fullName": "John Farmer",
        "nic": "198512345678",
        "mobile": "+94771234568",
        "dob": "1985-01-15",
        "gender": "Male",
        "relation": "Spouse"
      }
    ]
  }
}
```

### Success Response (201)
```json
{
  "success": true,
  "message": "Member registered successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "id": "1734350400000",
    "fullName": "Jane Farmer",
    "mobile": "+94771234567",
    "nic": "199012345678",
    "location": "123 Farm Road, Colombo",
    "email": "jane@example.com",
    "role": "Member",
    "status": "pending",
    "residents": [...],
    "landOne": {...},
    "createdAt": "2025-12-16T10:30:00.000Z"
  }
}
```

---

## 👥 Member Registration (via memberController)

### Endpoint
```
POST /api/members (with authentication)
```

### Request Body
```json
{
  "name": "Jane Farmer",
  "address": "123 Farm Road",
  "mobile": "+94771234567",
  "nic": "199012345678",
  "memberCode": "MEM001"
}
```

### Success Response (201)
```json
{
  "success": true,
  "message": "Member registered successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Jane Farmer",
    "address": "123 Farm Road",
    "mobile": "+94771234567",
    "nic": "199012345678",
    "memberCode": "MEM001",
    "fieldVisitorId": "507f1f77bcf86cd799439012",
    "registeredAt": "2025-12-16T10:30:00.000Z"
  }
}
```

---

## 🔧 Common Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "message": "Please provide all required fields: name, email, password"
}
```

### Duplicate Entry (400)
```json
{
  "success": false,
  "message": "Email already exists"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Registration failed",
  "error": "Specific error message"
}
```

---

## 🎯 Flutter Implementation Example

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<void> registerManager() async {
  final url = Uri.parse('http://10.0.2.2:3000/api/auth/register');
  final userData = {
    "name": "Sabi",
    "email": "sabi@example.com",
    "password": "123456",
  };

  try {
    final response = await http.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode(userData),
    );

    if (response.statusCode == 201) {
      final data = jsonDecode(response.body);
      if (data['success'] == true) {
        print("Registered user: ${data['data']}");
        print("Token: ${data['data']['token']}");
      }
    } else {
      final data = jsonDecode(response.body);
      print("Registration failed: ${data['message']}");
    }
  } catch (e) {
    print("Network or parsing error: $e");
  }
}
```

---

## ✅ Key Features Implemented

1. ✅ **Consistent Schema Validation**: All models use proper Mongoose validation
2. ✅ **Proper Async/Await**: All save operations use `await newModel.save()`
3. ✅ **Immediate Response**: Saved documents returned immediately
4. ✅ **Flutter-Friendly JSON**: Consistent response format with `success`, `message`, `data`
5. ✅ **Error Handling**: Duplicate keys, validation errors, and server errors handled
6. ✅ **CORS Configuration**: Full CORS support for mobile apps
7. ✅ **Password Hashing**: Pre-save hooks handle password encryption
8. ✅ **Token Generation**: JWT tokens generated on successful registration

---

## 🚀 Testing the API

### Using curl:
```bash
# Register Manager
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Sabi","email":"sabi@example.com","password":"123456"}'

# Register Field Visitor
curl -X POST http://localhost:3000/api/fieldvisitors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"John","userId":"FV001","phone":"+94771234567","password":"pass123"}'

# Register Member
curl -X POST http://localhost:3000/api/members \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Jane","mobile":"+94771234567","address":"Farm Road"}'
```

### From Flutter (Android Emulator):
- Use `http://10.0.2.2:3000` instead of `localhost`
- Use `http://YOUR_IP:3000` for physical devices

---

## 🔒 Security Notes

- Passwords are automatically hashed using bcrypt (via pre-save hooks)
- JWT tokens are generated on successful registration
- CORS is configured for development (adjust for production)
- Always validate input on both client and server side
