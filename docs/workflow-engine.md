# FlowPilot AI — Workflow Engine Architecture

This document describes the architectural design, node categories, and execution mechanics of the FlowPilot AI Workflow Execution Engine.

---

## 1. Engine Core Overview

The FlowPilot AI Workflow Engine processes directed graph workflows where nodes represent operations (Triggers, AI processing, Logic evaluation, Actions) and edges (Connections) represent data flow and execution control paths.

```
Incoming Event (Trigger)
           │
           ▼
┌─────────────────────┐
│  Trigger Execution  │ ──> Produces initial Output Context
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Graph Traversal    │ ──> Evaluates target node dependencies
└──────────┬──────────┘
           │
           ├───> [ AI Node ] ───────> Query AI Provider Interface
           ├───> [ Logic Node ] ────> Evaluate Condition / Branching
           └───> [ Action Node ] ───> Perform Side Effect (HTTP, Email, DB)
           │
           ▼
┌─────────────────────┐
│  Execution Logging  │ ──> Persists execution state & step logs to DB
└─────────────────────┘
```

---

## 2. Planned Node Categories & Specifications

### 2.1 Triggers (Starting Points)
Every workflow begins with exactly one active trigger node:
- **Manual Trigger:** Manually initiated by user via UI button click or API call.
- **Webhook Trigger:** Exposes an HTTP endpoint (`/api/webhooks/:workflowId`) that triggers on incoming HTTP POST/GET requests.
- **Schedule Trigger:** Triggers execution automatically based on a cron expression or timer interval.

### 2.2 AI Nodes (Intelligence)
Nodes that send structured prompts to the AI Provider Interface:
- **Gemini AI:** General-purpose AI text generation and chat completion node.
- **AI Classification:** Classifies input text into predefined labels/categories using structured output schema.
- **AI Extraction:** Extracts structured entities (JSON/key-values) from unstructured text.
- **AI Summarization:** Concise text summarization with customizable target length and bullet formatting.
- **AI Generation:** Creative generation node for emails, code, responses, or formatted copy.

### 2.3 Logic Nodes (Flow Control)
Nodes that route execution or manipulate data flow:
- **Condition / IF:** Evaluates rules (e.g., `value == 'urgent'`). Routes execution to `true` or `false` output handle.
- **Switch:** Evaluates multiple expression branches to route flow to one of several output paths.
- **Filter:** Filters array items based on evaluation criteria.
- **Delay:** Halts execution for a specified duration (e.g., wait 5 minutes) before continuing.

### 2.4 Action Nodes (Side Effects)
Nodes that interact with external services or systems:
- **Send Email:** Dispatches transactional emails via configured SMTP or transactional email API.
- **HTTP Request:** Makes custom REST API calls (GET, POST, PUT, DELETE) with configurable headers, parameters, and payload.
- **Create Database Record:** Inserts records into configured external or system database tables.
- **Update Database Record:** Modifies database records matching specific keys.
- **Webhook Action:** Outgoing HTTP POST webhook call to third-party endpoints.

---

## 3. Data Flow & Variable Interpolation

When a node executes, its output payload is stored in the **Execution Context**:

```json
{
  "trigger": {
    "body": { "customer_name": "Jane Doe", "email": "jane@example.com", "issue": "Billing question" },
    "headers": { "content-type": "application/json" }
  },
  "steps": {
    "node_ai_classify": {
      "category": "billing",
      "priority": "high"
    }
  }
}
```

Downstream nodes can reference outputs from previous nodes using expression syntax:
- `{{steps.node_ai_classify.category}}`
- `{{trigger.body.email}}`

---

## 4. Execution State & Logging

Each workflow execution creates a persistent record in PostgreSQL with the following status flow:

1. **Pending:** Execution scheduled or enqueued.
2. **Running:** Engine actively evaluating graph nodes.
3. **Completed:** All reachable graph paths executed successfully.
4. **Failed:** Unhandled node error halted execution.

For every node processed during an execution, a detailed `ExecutionLog` is created containing:
- `nodeId`
- `status` (`success` | `error` | `skipped`)
- `timestamp`
- `inputData` (interpolated input payload)
- `outputData` (node execution output)
- `error` (stack trace / error description if failed)

---

## 5. Error Handling & Retry Mechanics

- **Node-Level Retries:** Nodes can be configured with retry policies (e.g., retry up to 3 times on HTTP 5xx or rate limit error with exponential backoff).
- **Error Handles:** Nodes can expose an `onError` output branch allowing workflows to catch errors gracefully (e.g., send notification on failure instead of failing the entire workflow execution).
- **Timeouts:** Individual node executions have strict maximum runtime limits (e.g., 30s max for HTTP requests) to prevent hung serverless instances.
