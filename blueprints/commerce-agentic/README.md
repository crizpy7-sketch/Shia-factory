# Agentic Commerce Blueprint

Status: **candidate**  
Version: **0.1.0**  
Factory layer: **Blueprint**  
Admission status: **not admitted**

## Outcome

Provide a reusable Shia Factory architecture for applications that need both:

1. a customer-facing shopping assistant; and
2. a merchant-facing operations assistant.

This blueprint does **not** create a new permanent Factory agent. Shia Core, BORIS, Design Director,
Gary, and Quality Gate remain the permanent workforce. Commerce behavior is application capability
implemented through the existing seven skill packs and governed by the existing Factory authority
model.

## Research provenance

This candidate was produced after studying Anthropic's public `anthropics/commerce-agents`
reference implementation at exact commit:

`fd4d59224ab96b43c6dc6888207c67b3bd5a24cf`

That repository is Apache-2.0 licensed. This candidate imports **no upstream implementation code**;
it records reusable architecture and safety patterns in Factory-native contracts so Shia Factory can
remain model-provider-neutral and host-system-neutral.

Patterns retained from the study include:

- separate customer and merchant surfaces over shared commerce contracts;
- server-owned backend adapters rather than model-owned business systems;
- source-grounded catalog, order, policy, analytics and inventory facts;
- session provenance before cart or merchant mutations;
- staged merchant changes with human approval before apply;
- checkout handoff instead of model-owned payment/order placement;
- configuration-derived tool allowlists;
- bounded, validated memory with deletion lifecycle;
- presentation payloads rebuilt from trusted server records rather than model-authored business facts;
- explicit disabling of capabilities a deployment does not possess;
- commerce-specific evaluations and adversarial tests.

## Factory mapping

| Factory role | Commerce responsibility |
| --- | --- |
| Shia Core | Decompose the commerce task, choose capabilities/adapters, enforce risk and lifecycle gates. |
| BORIS | Implement backend adapters, tool contracts, deterministic guards, tests and runtime integration. |
| Design Director | Own customer shopping UX, merchant review/approval UX, accessibility and responsive presentation. |
| Gary | Define merchandising, offers, growth experiments and measurement without bypassing commerce guardrails. |
| Quality Gate | Independently evaluate exact-candidate functional, safety, UX and authority evidence. |

All seven permanent skill packs participate: Product, Design, Engineering, AI, Quality, Growth and
Operations.

## Reference architecture

```text
Customer surface                         Merchant surface
       |                                       |
       v                                       v
Shopping capability                  Merchant operations capability
       |                                       |
       +-------------------+-------------------+
                           |
                           v
                 Commerce capability core
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
      Catalog/cart     Orders/policies   Analytics/inventory
          |                |                |
          +----------------+----------------+
                           |
                           v
                  Host-owned adapters
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
        Square          Database        Shipping/CRM/etc.
```

The model never becomes a source of truth for product ids, prices, inventory, orders, policy text,
analytics figures, payment credentials or approval state.

## Customer shopping surface

A compatible application may expose capabilities such as catalog search, product comparison,
multi-item planning, preference-aware recommendations, cart construction, order support and policy
support.

Required boundaries:

- catalog and price facts come from server-side adapters;
- cart writes require product provenance from the current session or an existing cart line;
- products with variants/options must be resolved by the backend before mutation;
- unsupported capabilities are removed rather than simulated;
- checkout returns a host-owned handoff; the model does not place the order and never receives
  payment credentials.

## Merchant operations surface

A compatible application may expose sales analysis, inventory intelligence, catalog maintenance,
promotion planning and campaign drafting.

Every merchant mutation follows this lifecycle:

`read -> propose -> guardrail check -> stage -> review -> host approve -> revalidate -> apply -> receipt`

Chat text is never approval. A preview is never approval. The host application owns identity,
authorization and the approval mark.

## Integration contract

The blueprint is commerce-platform-neutral. Application adapters are expected to implement the
business system boundaries the app actually owns. Typical adapters include:

- catalog;
- cart;
- checkout handoff;
- orders;
- policies;
- analytics;
- inventory;
- pricing/promotions;
- campaigns;
- customer profile/CRM;
- shipping/fulfillment.

Square, Shopify, Stripe, PostgreSQL, Supabase and other providers are possible implementations of
these boundaries, not architectural defaults. Provider choice must come from the application's
`APP_PROFILE` and source-of-truth requirements.

## Default web stack

For Shia Factory web products, the candidate assumes the current serious-web default:

- Next.js + TypeScript for the application surface;
- server-side commerce adapters;
- provider-neutral Factory model routing;
- an application-selected database/source of truth;
- responsive customer and merchant interfaces;
- host-owned checkout and deployment.

This does not make Anthropic's Python runtime a Shia Factory requirement. Their implementation is a
reference architecture; the Factory may implement equivalent contracts in the application's native
stack when that is the better engineering choice.

## Safety invariants

The machine-readable policy is `commerce-policy.json`. Key invariants are:

- no payment credentials in model context;
- no model order-placement authority;
- host-owned checkout handoff;
- server-side credentials;
- configuration-derived tool allowlist and deny-unknown behavior;
- provenance-gated mutations;
- merchant writes staged before apply;
- host approval required for merchant apply;
- business rules enforced again in the backend;
- untrusted third-party text treated as data, not instructions;
- memory disabled until an application defines retention, inspection and deletion behavior.

## Quality requirements

A future admitted version must carry exact-candidate evidence for at least:

- catalog grounding and variant handling;
- cart provenance and mutation limits;
- checkout boundary / no-payment-autonomy behavior;
- order and policy grounding;
- merchant staging provenance;
- merchant approval authority;
- apply-time guardrail revalidation;
- memory validation, retention and deletion;
- tool allowlisting and disabled-capability behavior;
- adversarial prompt/tool tests;
- responsive customer UX;
- merchant diff/review UX;
- accessibility and visual quality;
- application-specific auth, rate limiting, log hygiene and backend business rules.

Green unit tests alone are insufficient for a customer-facing commerce product.

## Shia Baby pilot path

Shia Baby is the intended first application pilot, but **this candidate does not modify or deploy the
Shia Baby storefront**. After this Blueprint is reviewed, the safe pilot sequence is:

1. profile the existing Shia Baby storefront and identify its real commerce source(s) of truth;
2. map catalog, cart, checkout, order and policy capabilities to adapters;
3. implement read-only catalog search/product-detail grounding first;
4. add recommendation/comparison and cart construction only after provenance tests pass;
5. add checkout as host handoff, never direct model payment;
6. implement the merchant surface read-only first (sales/inventory/digest);
7. enable staged writes only after the approval surface and guardrails pass Quality Gate;
8. run functional, adversarial, accessibility, visual and conversion-flow evaluation;
9. request exact-candidate approval before production deployment.

## Admission state

This directory is deliberately a **candidate**, not a certified Shelf asset. It has not yet satisfied
`factory/shelf/admission-policy.json`, does not alter Core v2 phase progress, does not authorize
production reuse, and does not authorize deployment.
