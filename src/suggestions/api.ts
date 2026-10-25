import type { SuggestionMap } from "./types.js";

export const apiSuggestions: SuggestionMap = {
  "api-status-mismatch": {
    code: "api-status-mismatch",
    title: "API Status Mismatch",
    problem: "The API endpoint returned an HTTP status code that did not match the expected contract status.",
    whyItMatters: "Incorrect status codes break API client expectations, automated retries, and RESTful contract compliance.",
    suggestedFix: [
      "Inspect the endpoint controller logic.",
      "Ensure proper HTTP status codes are explicitly set (e.g., res.status(201) for resource creation, res.status(400) for validation errors, res.status(401) for unauthorized requests).",
    ],
    shortFix: "Return expected HTTP status code from endpoint handler.",
  },
  "api-missing-fields": {
    code: "api-missing-fields",
    title: "API Missing Required Fields",
    problem: "The API response JSON body is missing one or more required schema fields.",
    whyItMatters: "Frontend and API consumers relying on mandatory response properties will throw null pointer or undefined property errors.",
    suggestedFix: [
      "Review the expected contract schema for missing properties.",
      "Ensure the endpoint serializer includes all mandatory fields in the JSON response body.",
    ],
    shortFix: "Ensure all required contract fields are included in the JSON response payload.",
  },
  "api-slow-response": {
    code: "api-slow-response",
    title: "API Slow Response",
    problem: "Endpoint response time exceeded the max allowed threshold.",
    whyItMatters: "High endpoint latency causes slow application performance and potential HTTP gateway timeouts.",
    suggestedFix: [
      "Profile database queries, network calls, and sync operations in the endpoint handler.",
      "Add index optimization, asynchronous worker queues, or response caching.",
    ],
    shortFix: "Optimize endpoint logic, database queries, or caching to reduce response latency.",
  },
  "api-invalid-json": {
    code: "api-invalid-json",
    title: "API Invalid JSON Response",
    problem: "The API endpoint returned an invalid or unparseable JSON payload.",
    whyItMatters: "API consumers expecting structured JSON will fail with syntax parsing exceptions.",
    suggestedFix: [
      "Ensure the server sets Content-Type: application/json.",
      "Verify that error handlers format error messages as valid JSON objects instead of plain HTML or text strings.",
    ],
    shortFix: "Ensure Content-Type: application/json header is sent and response payload is valid JSON.",
  },
};
