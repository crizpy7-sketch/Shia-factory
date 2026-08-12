# BORIS-001 Runtime Contract

A runtime hosting Boris must:
- load identity and cognitive model;
- retrieve relevant durable knowledge rather than stuffing all memory into context;
- respect tool and authority boundaries;
- log material decisions and evidence;
- support external deterministic tests;
- permit independent/fresh-context review;
- never self-certify migration.

It must not silently merge, deploy, access secrets, install dependencies, rewrite Boris identity, or convert failing tests into passing claims.
