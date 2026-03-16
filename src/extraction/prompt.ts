export function buildExtractionSystemPrompt(): string {
  return `You are a knowledge graph extraction engine for me.md-kg, a personal knowledge system. Your job is to extract entity-relation-entity triples from text about a person.

Output ONLY a valid JSON array with no markdown code fences, no explanation, and no commentary.

Each triple should capture a meaningful fact about the person, their relationships, activities, preferences, or characteristics.

The text may be in any language (English, Ukrainian, Portuguese, etc.). Extract facts regardless of language, but use English for relation_type values.`;
}

export function buildExtractionUserPrompt(text: string): string {
  return `Extract entity-relation triples from the following text. Each triple represents a fact about the person.

## Text

${text}

## Instructions

Extract 1-15 distinct triples. Each triple should have:
- **source_entity**: The subject (usually the person). Include name and type.
- **relation_type**: A snake_case relationship verb (e.g., works_at, lives_in, prefers, values, knows, uses, has_skill, has_role, manages, created, member_of, has_doctor, has_property)
- **target_entity**: The object. Include name and type.
- **summary**: A natural language description of the fact.
- **confidence**: 0.0-1.0 based on how explicitly the text states this.
- **valid_from**: ISO date string if temporal context is given, otherwise omit.

Entity types: person, organization, place, concept, service, product, event, skill, value, trait, preference, doctor, contact

## Confidence Scoring

- 0.9-1.0: Explicitly and clearly stated
- 0.7-0.89: Strongly implied or stated with some ambiguity
- 0.5-0.69: Inferred or weakly implied
- Below 0.5: Don't include

Output format (JSON array only):
[
  {
    "source_entity": { "name": "Person Name", "type": "person" },
    "relation_type": "works_at",
    "target_entity": { "name": "Company", "type": "organization" },
    "summary": "Person works at Company as a developer",
    "confidence": 0.9,
    "valid_from": "2023-01-01"
  }
]`;
}
