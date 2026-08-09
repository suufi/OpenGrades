# Optimal Course Embedding Format

## Operational Source of Truth

- Canonical generation flow: Settings UI/API (`/api/embeddings/generate`)
- `scripts/regenerate-all-embeddings.ts` is retained for bulk backfill/recovery only
- Scope model:
- `public` catalog embeddings use OpenAI `text-embedding-3-large`
- `private` review/content embeddings use local/self-hosted models

### Rollout Command Order

```sh
# 1) Create/validate scoped ES indexes
npx tsx scripts/setup-es-embeddings-index.ts --recreate

# 2) Generate embeddings (preferred: Settings UI/API)
npx tsx scripts/regenerate-all-embeddings.ts --scope all --force

# 3) Monstache syncs Mongo CourseEmbedding -> ES (primary path)
# Ensure scope routing:
#   public  -> ELASTICSEARCH_PUBLIC_EMBEDDINGS_INDEX
#   private -> ELASTICSEARCH_PRIVATE_EMBEDDINGS_INDEX

# 4) Optional manual fallback sync (if Monstache is down/lagging)
npx tsx scripts/sync-embeddings-to-es.ts --scope all

# 5) Health checks
npx tsx scripts/embedding-health-report.ts

# 6) End-to-end recommendation eval
npx tsx scripts/eval-rag-recommendations.ts
```

## Current Format (Good, but can be improved)

The current format includes:
- Subject number and title
- Department
- Aliases
- Term, units, instructors (less useful)
- GIR/HASS/Communication attributes
- Prerequisites/corequisites
- Class tags
- Description

## Recommended Optimal Format

For best semantic search results, prioritize fields in this order:

### 1. **Core Identity** (Highest Priority - appears first)
```
{subjectNumber}: {subjectTitle}
Also listed as: {aliases.join(', ')}
```
**Why**: Subject number and title are the most important for matching queries like "machine learning courses". Aliases are critical for cross-listed courses (e.g., HST.956/6.871).

### 2. **Department Context**
```
Department: {department}
Cross-listed: {crossListedDepartments.join(', ')}
```
**Why**: Helps with semantic understanding and department-based recommendations.

### 3. **Semantic Metadata** (High Priority)
```
Prerequisites: {prerequisites}
Corequisites: {corequisites}
```
**Why**: Prerequisites show course relationships. Note: classTags are NOT included as they represent degree program fulfillments (e.g., "CI-H", "HASS-A"), not semantic course content.

### 4. **Description** (Main Content)
```
{description}
```
**Why**: The bulk of semantic content, but less structured than title/tags.

### 5. **Attributes** (Lower Priority - can be included but less critical)
```
GIR: {girAttribute.join(', ')}
HASS: {hassAttribute}
Communication: {communicationRequirement}
```

### 6. **Exclude** (Don't include)
- `term` - Changes each term, not semantically meaningful
- `academicYear` - Changes each year, not semantically meaningful
- `instructors` - Changes each term, not semantically meaningful
- `units` / `unitHours` - Not semantically meaningful
- `instructorDetails` - Not semantically meaningful

## Recommended Implementation

```typescript
function buildEmbeddingText(course: IClass): string {
    const parts: string[] = []
    
    // 1. Core identity (MOST IMPORTANT - appears first)
    parts.push(`${course.subjectNumber}: ${course.subjectTitle}`)
    
    // 2. Aliases (CRITICAL for cross-listed courses)
    if (course.aliases?.length > 0) {
        parts.push(`Also listed as: ${course.aliases.join(', ')}`)
    }
    
    // 3. Department context
    parts.push(`Department: ${course.department}`)
    if (course.crossListedDepartments?.length > 0) {
        parts.push(`Cross-listed: ${course.crossListedDepartments.join(', ')}`)
    }
    
    // 4. Semantic metadata (tags are often very useful)
    if (course.classTags?.length > 0) {
        parts.push(`Tags: ${course.classTags.join(', ')}`)
    }
    
    // 5. Prerequisites/corequisites (show relationships)
    if (course.prerequisites) {
        parts.push(`Prerequisites: ${course.prerequisites}`)
    }
    if (course.corequisites) {
        parts.push(`Corequisites: ${course.corequisites}`)
    }
    
    // 6. Attributes (optional, less critical)
    if (course.girAttribute?.length > 0) {
        parts.push(`GIR: ${course.girAttribute.join(', ')}`)
    }
    if (course.hassAttribute) {
        parts.push(`HASS: ${course.hassAttribute}`)
    }
    if (course.communicationRequirement) {
        parts.push(`Communication: ${course.communicationRequirement}`)
    }
    
    // 7. Description (main content)
    parts.push(course.description || 'No description available')
    
    return parts.join('. ').substring(0, 8000)
}
```

## Why This Format?

1. **Subject number + title first**: Ensures queries like "machine learning courses" match "Machine Learning for Healthcare" immediately
2. **Aliases prominently placed**: Critical for HST.956/6.871 type issues - ensures both numbers are in the embedding
3. **Tags before description**: Class tags often contain key semantic terms that might not be in the description
4. **Structured format**: Using periods and clear labels helps the embedding model understand structure
5. **Excludes volatile data**: Term, year, instructors change frequently and aren't semantically useful

## Example Output

For HST.956:
```
HST.956: Machine Learning for Healthcare. Also listed as: 6.871. Department: HST. Cross-listed: EECS. Tags: machine learning, healthcare, artificial intelligence, clinical data. Prerequisites: 6.3900 or 6.4100 or 6.7810 or 6.7900 or 6.8611 or 9.520. Introduces students to machine learning in healthcare, including the nature of clinical data and the use of machine learning for risk stratification, disease progression modeling, precision medicine, diagnosis, subtype discovery, and improving clinical workflows...
```

This ensures "machine learning" appears multiple times (in title, tags, description) and both HST.956 and 6.871 are present.
