---
name: me.md-kg
description: Personal knowledge graph — verified facts about you
metadata:
  openclaw:
    emoji: "🧠"
    requires:
      bins: [tsx]
      env: [ANTHROPIC_API_KEY]
user-invocable: true
command-dispatch: tool
---

# me.md Knowledge Graph

Personal knowledge graph with verified facts about the user. Stores entities (people, places, orgs, concepts) and their relationships with temporal validity and provenance tracking.

## Tools

### kg_query
Structured query against the knowledge graph. Ask natural language questions about the user.

```
kg_query "who are my doctors?"
kg_query "where do I work?"
kg_query "what services do I use for Podavach?"
```

### kg_browse
Explore the neighborhood of an entity — see everything connected to it within N hops.

```
kg_browse "Podavach"
kg_browse "Lisbon" --depth 2
```

### kg_verify
Present unverified facts for human confirmation. Run periodically or on demand.

```
kg_verify              # show next batch of unverified facts
kg_verify --all        # show all unverified
kg_verify --weekly     # weekly knowledge review
```

### kg_add
Manually add a fact to the knowledge graph.

```
kg_add "My doctor is Patrícia, osteopath, +351 964 960 916"
kg_add "I started using Linear for project management in March 2026"
```

### kg_stats
Show knowledge graph statistics.

```
kg_stats
```

### kg_onboard
Run guided interview to build initial knowledge graph.

```
kg_onboard
```

### kg_export
Export verified knowledge as me.md, CLAUDE.md, or JSON.

```
kg_export --format md
kg_export --format claude
kg_export --format json
```

## Access Control

Each fact has access tags controlling which agents can see it:
- `all` — visible to all agents
- `main` — only Pan (personal data)
- `podavach-shopify` — Pan and Kir
- Agent only sees facts tagged with its own workspace name.

## Data Storage

SQLite database at `~/.memd/kg.db`. No external server needed.
