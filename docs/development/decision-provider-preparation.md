# Decision provider preparation

This branch prepares an internal System One codec. It does **not** register a
decision provider, publish decision models, or enable Jev in OpenClaw. Existing
plugin compatibility, configuration and supported capabilities remain unchanged.

## Completed boundary

`system-one-codec.ts` takes an explicit model and a V1-shaped batch of JSON state
and boolean/choice/score questions. It produces the System One `state`/questions
map, translating boolean to `noul`. Model IDs are preserved verbatim. It validates
response correspondence and returns boolean probabilities, named choice estimates
and index-aligned score estimates. Returned model identity, fractional scores,
reported choices, independently rounded probabilities and optional confidence/token
usage are preserved; no argmax, score recomputation or probability normalization
occurs. A supplied score legend must match the submitted rubric.

The codec is pure and detached from caller input. It accepts plain finite JSON,
rejects getters/coercions/cycles and applies local resource guards (4 MiB, depth 64,
262144 nodes). These guards are not model capabilities and must not be published
as catalog metadata. Vendor fields the normalized result does not consume, such as
cost, are not projected into the V1-shaped output. Confidence, usage and legend
are optional for this common subset; this is not a full TypeSafe-specific validator.
Errors use fixed messages without copying supplied state or upstream diagnostics.

The module has no SDK imports, network requests, credential resolution, cache or
registration side effects. Tests exercise the codec rather than a mocked copy.
They do not establish gateway transport behavior or Jev judgment quality.

## Evidence pins

- Plugin base: `9eb2cf01c74a12283eb48dba8f63e873f567072e` (v2.4.0).
- Gateway proposal: [OmniRoute #17994](https://github.com/cheaper-inference/OmniRoute/pull/17994),
  inspected at `68f483bf8c46664e36dd9a92c90603908bb33d1a` on 2026-10-26.
  Its [handler](https://github.com/cheaper-inference/OmniRoute/blob/68f483bf8c46664e36dd9a92c90603908bb33d1a/open-sse/handlers/systemOne.ts)
  passes System One requests and responses through with model routing.
- Host subset: [OpenClaw v2026.10.6 decision types](https://github.com/openclaw/openclaw/blob/v2026.10.6/src/decisions/types.ts)
  and [TypeSafe adapter](https://github.com/openclaw/openclaw/blob/v2026.10.6/extensions/typesafe/src/decisions.ts).
  The pure module deliberately avoids requiring that SDK at runtime or claiming
  the broader V2 input contract.

## Remaining activation decisions

1. Select an exact supported host and prove its public decision-model discovery
   path. The released TypeSafe example uses static `decisionModels`; this plugin
   must use authenticated OmniRoute catalog facts and preserve exact IDs. Verify
   any dynamic seam rather than assuming the static example is the only path.
2. Settle how OmniRoute advertises System One versus native OpenAI Decisions.
   The inspected PR aliases `/decisions` to `/systemone`; these wire formats are
   not interchangeable. This codec is only for `/systemone`.
3. Decide whether decision support is optional on newer hosts or raises the
   plugin floor. The [2026.7.1 guarded transport](https://github.com/openclaw/openclaw/blob/v2026.7.1/src/infra/net/fetch-guard.ts)
   lacks the `beforeRequest` hook used for physical-dispatch admission in
   [2026.10.6](https://github.com/openclaw/openclaw/blob/v2026.10.6/src/infra/net/fetch-guard.ts).
   Checking before an awaited DNS/queue operation is insufficient. Do not silently
   ignore this admission check on old hosts.

After these decisions, implement a transport-only client using the existing
`http.ts` owner and prepared request settings. The selected host adapter owns auth,
config and model preparation; do not resolve V1 credentials inside a client reused
by V2, which supplies prepared context. Forward admission to physical dispatch,
preserve terminal authority errors, enforce cancellation/deadlines through body
reads and cleanup, bound JSON reads and release transport on every path. Reuse
this codec only for the verified JSON subset. No retries, inferred model defaults,
model-prefix rewriting or direct TypeSafe fallback.

Then register the adapter and authenticated catalog projection, update public
capability metadata, and run packed floor/current-host tests. Prove transport with
an isolated pinned gateway and synthetic upstream before claiming end-to-end
support. A later real Jev request tests the vendor separately.
