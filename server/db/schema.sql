PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- =========================================================
-- DIVYADHARA MASTER DATABASE SCHEMA
-- =========================================================
--
-- Public content:
--   Home
--   Temples + Temple Detail
--   Puja Services + Detail
--   Pandits + Detail
--   Ashrams + Detail
--   Yatra Packages + Detail
--   Spiritual Places + Detail
--   Events + Detail
--   Gallery
--   Videos
--   Courses + Detail
--   Wisdom / Articles used by Home
--
-- SEO:
--   Entity-level SEO for Temple / Pandit / Puja Service / Ashram
--   Country / State / District / City location landing pages
--   Programmatic location-aware catalogue listing SEO
--   SEO content blocks, FAQs, JSON-LD, breadcrumbs, hreflang
--   canonical / robots / sitemap controls and redirects
--   keyword clusters, internal linking and crawl health
--
-- LOCATION FILTERING:
--   Canonical country -> state -> district -> city -> area hierarchy
--   Cached ancestry IDs on locations for fast filters
--   Pandit multi-location service areas
--   Puja Service multi-location availability
--   Exact city + parent geography filtering without relying on free text
--
-- Lead / CRM:
--   form definitions + raw submissions
--   typed puja/pandit/yatra/temple/ashram/event/course requests
--   assignments, follow-ups, notes, communications, tags, consents
--
-- Analytics:
--   visitor identity + sessions + page views + micro-events
--   daily page/site aggregates + conversion attribution
--
-- Monetisation:
--   Pandit / Temple / Ashram subscription plans
--   lead quota
--   Razorpay order/payment/payment-link/webhook ledger
--
-- NOTE:
-- This is the target/master schema. For an existing SQLite database,
-- additive/rebuild migrations are still required because
-- CREATE TABLE IF NOT EXISTS does not alter existing table definitions.
-- =========================================================


-- =========================================================
-- 1. ROLES
-- =========================================================

CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,

    -- Public registration is deliberately role-specific.
    -- Sales and Super Admin must never be publicly self-registered.
    public_registration_enabled INTEGER NOT NULL DEFAULT 0 CHECK (public_registration_enabled IN (0, 1)),
    approval_required INTEGER NOT NULL DEFAULT 0 CHECK (approval_required IN (0, 1)),
    dashboard_path TEXT,

    is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 2. PERMISSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    module TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 3. ROLE PERMISSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (role_id, permission_id),

    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);


-- =========================================================
-- 4. USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER NOT NULL,

    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT,

    password_hash TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'pending',
                'active',
                'suspended',
                'rejected',
                'blocked'
            )
        ),

    email_verified_at TEXT,
    phone_verified_at TEXT,
    last_login_at TEXT,

    avatar TEXT,

    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);


-- =========================================================
-- 5. VISITOR PROFILES
-- =========================================================

CREATE TABLE IF NOT EXISTS visitor_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,

    preferred_language TEXT,
    date_of_birth TEXT,
    gender TEXT,

    address TEXT,
    pincode TEXT,

    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,

    marketing_consent INTEGER NOT NULL DEFAULT 0
        CHECK (marketing_consent IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- =========================================================
-- 6. LOCATIONS
-- =========================================================
-- One source of truth for country/state/city SEO and filters.

CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    parent_id INTEGER,

    type TEXT NOT NULL
        CHECK (
            type IN (
                'country',
                'state',
                'district',
                'city',
                'area'
            )
        ),

    name TEXT NOT NULL,
    slug TEXT NOT NULL,

    code TEXT,
    state_code TEXT,
    district_code TEXT,
    city_code TEXT,
    country_code TEXT,

    -- Canonicalised searchable name + alternate/local names are managed
    -- separately in location_aliases so filters remain normalised.
    normalized_name TEXT,
    canonical_name TEXT,
    native_name TEXT,
    aliases_json TEXT NOT NULL DEFAULT '[]',

    description TEXT,

    latitude REAL,
    longitude REAL,
    timezone TEXT,

    -- Cached ancestry. These are denormalised for fast country/state/
    -- district/city filtering; location_id remains the canonical node.
    country_id INTEGER,
    state_id INTEGER,
    district_id INTEGER,
    city_id INTEGER,

    -- Stable SEO path for this location. Treat slug/path changes as an SEO
    -- migration problem and create a redirect instead of silently changing URL.
    seo_path TEXT,
    seo_enabled INTEGER NOT NULL DEFAULT 1 CHECK (seo_enabled IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'draft',
                'active',
                'inactive'
            )
        ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_id) REFERENCES locations(id) ON DELETE SET NULL,

    UNIQUE (parent_id, slug),
    UNIQUE (seo_path)
);


-- =========================================================
-- 6.1 LOCATION ALIASES / LOCAL NAMES
-- =========================================================
-- Supports search such as Banaras -> Varanasi, Kashi -> Varanasi,
-- local-language spellings and common abbreviations without corrupting
-- the canonical location name/slug.

CREATE TABLE IF NOT EXISTS location_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    location_id INTEGER NOT NULL,

    language TEXT NOT NULL DEFAULT 'en',
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,

    alias_type TEXT NOT NULL DEFAULT 'alternate'
        CHECK (
            alias_type IN (
                'alternate',
                'local',
                'transliteration',
                'abbreviation',
                'historical'
            )
        ),

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,

    UNIQUE (location_id, language, normalized_alias)
);


-- =========================================================
-- 6.2 LOCATION DIRECTORY VIEW
-- =========================================================
-- Convenience view for filters, breadcrumbs and SEO generators.

CREATE VIEW IF NOT EXISTS location_directory AS
SELECT
    l.id,
    l.parent_id,
    l.type,
    l.name,
    l.slug,
    l.normalized_name,
    l.canonical_name,
    l.native_name,
    l.code,
    l.state_code,
    l.district_code,
    l.city_code,
    l.country_code,
    l.latitude,
    l.longitude,
    l.timezone,
    l.status,
    l.seo_enabled,
    l.seo_path,
    l.sort_order,
    l.country_id,
    c.name AS country_name,
    l.state_id,
    st.name AS state_name,
    l.district_id,
    d.name AS district_name,
    l.city_id,
    ci.name AS city_name,
    l.created_at,
    l.updated_at
FROM locations l
LEFT JOIN locations c ON c.id = l.country_id
LEFT JOIN locations st ON st.id = l.state_id
LEFT JOIN locations d ON d.id = l.district_id
LEFT JOIN locations ci ON ci.id = l.city_id;


-- =========================================================
-- 7. PANDIT PROFILES
-- =========================================================

CREATE TABLE IF NOT EXISTS pandit_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL UNIQUE,

    slug TEXT NOT NULL UNIQUE,

    display_name TEXT NOT NULL,
    title TEXT,

    photo TEXT,

    experience_years INTEGER NOT NULL DEFAULT 0
        CHECK (experience_years >= 0),

    location TEXT,
    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT NOT NULL DEFAULT 'India',

    location_id INTEGER,

    -- Cached geography for fast exact-level filtering. location_id is the
    -- canonical primary node; these IDs mirror its ancestry.
    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,

    languages_json TEXT NOT NULL DEFAULT '[]',
    specializations_json TEXT NOT NULL DEFAULT '[]',
    puja_types_json TEXT NOT NULL DEFAULT '[]',
    service_areas_json TEXT NOT NULL DEFAULT '[]',

    associated_with TEXT,
    about TEXT,
    availability TEXT,

    -- Front-end Pandit JSON compatibility.

    profile_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            profile_status IN (
                'draft',
                'pending',
                'approved',
                'rejected',
                'suspended'
            )
        ),

    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            verification_status IN (
                'pending',
                'in_review',
                'verified',
                'rejected',
                'expired'
            )
        ),

    identity_verified INTEGER NOT NULL DEFAULT 0 CHECK (identity_verified IN (0, 1)),
    profile_verified INTEGER NOT NULL DEFAULT 0 CHECK (profile_verified IN (0, 1)),
    authorized_contact INTEGER NOT NULL DEFAULT 0 CHECK (authorized_contact IN (0, 1)),

    verified_at TEXT,
    verification_notes TEXT,

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    listing_active INTEGER NOT NULL DEFAULT 0 CHECK (listing_active IN (0, 1)),

    rejection_reason TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 8. PANDIT SERVICE OFFERINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS pandit_service_offerings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    pandit_id INTEGER NOT NULL,

    name TEXT NOT NULL,
    slug TEXT,

    description TEXT,

    -- Preserve front-end display values such as "₹5,100" and "2 hrs".
    price_display TEXT,
    duration_text TEXT,

    price_amount INTEGER
        CHECK (price_amount IS NULL OR price_amount >= 0),

    currency TEXT NOT NULL DEFAULT 'INR',

    duration_minutes INTEGER
        CHECK (duration_minutes IS NULL OR duration_minutes > 0),

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE CASCADE
);


-- =========================================================
-- 9. PANDIT VERIFICATION DOCUMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS pandit_verification_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    pandit_id INTEGER NOT NULL,

    document_type TEXT NOT NULL
        CHECK (
            document_type IN (
                'government_id',
                'address_proof',
                'guru_reference',
                'parampara_reference',
                'qualification',
                'video_sample',
                'other'
            )
        ),

    document_name TEXT,
    document_url TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),

    reviewer_id INTEGER,
    reviewer_note TEXT,
    reviewed_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 9.1 PANDIT SERVICE LOCATIONS
-- =========================================================
-- Normalised replacement/extension for service_areas_json. A Pandit can
-- serve one city, several cities, an entire district/state, or travel areas.

CREATE TABLE IF NOT EXISTS pandit_service_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    pandit_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,

    relation_type TEXT NOT NULL DEFAULT 'service_area'
        CHECK (
            relation_type IN (
                'primary',
                'service_area',
                'home_visit',
                'travel_area'
            )
        ),

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    priority INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,

    UNIQUE (pandit_id, location_id, relation_type)
);


-- =========================================================
-- 10. TEMPLES
-- =========================================================

CREATE TABLE IF NOT EXISTS temples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,
    sanskrit_name TEXT,
    deity TEXT,

    temple_type TEXT,
    tradition TEXT,
    established TEXT,

    summary TEXT,
    description TEXT,
    history TEXT,

    activities_json TEXT NOT NULL DEFAULT '[]',
    schedule_json TEXT NOT NULL DEFAULT '[]',
    stay TEXT,
    food TEXT,
    courses_json TEXT NOT NULL DEFAULT '[]',
    contact_note TEXT,

    image TEXT,
    logo TEXT,
    gallery_json TEXT NOT NULL DEFAULT '[]',
    category_json TEXT NOT NULL DEFAULT '[]',

    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT NOT NULL DEFAULT 'India',

    location_id INTEGER,

    -- Cached ancestry for country/state/district/city listing filters.
    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,

    address TEXT,
    latitude REAL,
    longitude REAL,
    map_url TEXT,

    trust_name TEXT,

    -- Central src/data/temples.ts compatibility / Shakti Peetha metadata.
    rating_text TEXT,
    peetha_number INTEGER CHECK (peetha_number IS NULL OR peetha_number > 0),
    peetha_body_part TEXT,
    shakti_form TEXT,
    bhairava TEXT,
    identification_note TEXT,
    map_embed_note TEXT,

    contact_phone TEXT,
    contact_email TEXT,
    website_url TEXT,

    booking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (booking_enabled IN (0, 1)),

    -- Direct front-end compatibility fields from Temple interface.
    story_video_id TEXT,
    content_note TEXT,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'pending',
                'published',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 11.1 TEMPLE CATEGORIES
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,

    description TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 11.2 TEMPLE CATEGORY MAP
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_category_map (
    temple_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,

    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (temple_id, category_id),

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES temple_categories(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.3 TEMPLE HISTORY
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    title TEXT,
    content TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.4 TEMPLE SIGNIFICANCE
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_significance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    content TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.5 TEMPLE DIVINE ATTRACTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_divine_attractions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    title TEXT NOT NULL,
    description TEXT,
    image TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.6 TEMPLE SCRIPTURAL CONNECTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_scriptural_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    title TEXT NOT NULL,
    context TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.7 TEMPLE PILGRIM EXPERIENCE
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_pilgrim_experience (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    content TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.8 TEMPLE BHAGAVATA CONNECTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_bhagavata_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    content TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.9 TEMPLE DARSHAN TIMINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_darshan_timings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    label TEXT NOT NULL,
    time_text TEXT NOT NULL,

    day_of_week INTEGER CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
    season TEXT,
    valid_from TEXT,
    valid_to TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.10 TEMPLE AARTI
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_aarti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    name TEXT NOT NULL,
    time_text TEXT NOT NULL,
    description TEXT,

    day_of_week INTEGER CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
    season TEXT,
    valid_from TEXT,
    valid_to TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.11 TEMPLE FESTIVALS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_festivals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    name TEXT NOT NULL,
    month TEXT,
    description TEXT,

    event_start_date TEXT,
    event_end_date TEXT,
    year INTEGER,

    image TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.12 TEMPLE FACILITIES
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_facilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.13 TEMPLE HOW TO REACH
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_how_to_reach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    mode TEXT NOT NULL,
    detail TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.14 TEMPLE COMMITTEE
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_committee (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    name TEXT NOT NULL,
    role TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.15 TEMPLE FAQS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    question TEXT NOT NULL,
    answer TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.16 TEMPLE NEARBY PLACES
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_nearby_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    name TEXT NOT NULL,
    distance_text TEXT,
    description TEXT,
    location_id INTEGER,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 11.17 TEMPLE SOURCES
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    title TEXT NOT NULL,
    organization TEXT NOT NULL,
    url TEXT NOT NULL,

    source_type TEXT NOT NULL
        CHECK (
            source_type IN (
                'Official Temple',
                'Government',
                'Tourism',
                'Ministry',
                'Reference'
            )
        ),

    purpose TEXT,
    last_verified TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.18 TEMPLE LIVE AARTI / LIVE DARSHAN
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_live_aarti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL UNIQUE,

    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),

    provider TEXT NOT NULL DEFAULT 'youtube'
        CHECK (
            provider IN (
                'youtube',
                'youtube-channel',
                'hls',
                'ipcamlive',
                'external'
            )
        ),

    video_id TEXT,
    channel_id TEXT,
    stream_url TEXT,
    ipcamlive_url TEXT,
    watch_url TEXT,

    title TEXT NOT NULL,
    time_text TEXT,

    is_official INTEGER NOT NULL DEFAULT 0 CHECK (is_official IN (0, 1)),

    last_verified_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 11.19 TEMPLE SEO KEYWORD/INTENT SNAPSHOT
-- =========================================================
-- Optional normalized snapshot. seo_entries remains the canonical SEO row.

CREATE TABLE IF NOT EXISTS temple_seo_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temple_id INTEGER NOT NULL,

    keyword_type TEXT NOT NULL
        CHECK (
            keyword_type IN (
                'primary',
                'location',
                'long_tail',
                'search_intent'
            )
        ),

    keyword TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE,

    UNIQUE (temple_id, keyword_type, keyword)
);


-- =========================================================
-- 12. TEMPLE MANAGER PROFILES
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_manager_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL UNIQUE,

    designation TEXT,
    organization_name TEXT,

    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            verification_status IN (
                'pending',
                'verified',
                'rejected',
                'suspended'
            )
        ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- =========================================================
-- 12. TEMPLE MANAGER ASSIGNMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_manager_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    temple_id INTEGER NOT NULL,
    manager_user_id INTEGER NOT NULL,
    assigned_by INTEGER,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'inactive',
                'revoked'
            )
        ),

    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE,
    FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 13. TEMPLE SCHEDULES
-- =========================================================
-- Darshan, Aarti and recurring temple timings.

CREATE TABLE IF NOT EXISTS temple_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    temple_id INTEGER NOT NULL,

    schedule_type TEXT NOT NULL
        CHECK (
            schedule_type IN (
                'darshan',
                'aarti',
                'puja',
                'other'
            )
        ),

    title TEXT NOT NULL,

    day_of_week INTEGER
        CHECK (
            day_of_week IS NULL
            OR day_of_week BETWEEN 0 AND 6
        ),

    start_time TEXT,
    end_time TEXT,

    season TEXT,

    notes TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE
);


-- =========================================================
-- 14. PUJA SERVICES
-- =========================================================

CREATE TABLE IF NOT EXISTS puja_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,
    category TEXT,
    tagline TEXT,

    short_description TEXT,
    description TEXT,
    description_json TEXT NOT NULL DEFAULT '[]',

    deity TEXT,
    sampradaya TEXT,

    duration_text TEXT,

    samagri_included INTEGER NOT NULL DEFAULT 0 CHECK (samagri_included IN (0, 1)),
    samagri_details TEXT,
    samagri_json TEXT NOT NULL DEFAULT '[]',

    benefits_json TEXT NOT NULL DEFAULT '[]',
    suitable_for_json TEXT NOT NULL DEFAULT '[]',

    image TEXT,
    gallery_json TEXT NOT NULL DEFAULT '[]',
    video_url TEXT,

    price_from_amount INTEGER
        CHECK (
            price_from_amount IS NULL
            OR price_from_amount >= 0
        ),

    price_display TEXT,
    faqs_json TEXT NOT NULL DEFAULT '[]',

    currency TEXT NOT NULL DEFAULT 'INR',

    -- Location model: national/online services may be shown broadly;
    -- location_based/hybrid services use puja_service_locations.
    availability_scope TEXT NOT NULL DEFAULT 'location_based'
        CHECK (
            availability_scope IN (
                'national',
                'location_based',
                'online',
                'hybrid'
            )
        ),

    default_location_id INTEGER,

    booking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (booking_enabled IN (0, 1)),
    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (default_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 14.1 PUJA SERVICE LOCATIONS
-- =========================================================
-- Allows a service to be discoverable by city/district/state/country while
-- preserving support for national/online services through availability_scope.

CREATE TABLE IF NOT EXISTS puja_service_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    puja_service_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,

    availability_type TEXT NOT NULL DEFAULT 'service_area'
        CHECK (
            availability_type IN (
                'service_area',
                'home',
                'temple',
                'travel'
            )
        ),

    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    priority INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (puja_service_id) REFERENCES puja_services(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,

    UNIQUE (puja_service_id, location_id, availability_type)
);


-- =========================================================
-- 15. TEMPLE <-> PUJA RELATION
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_puja_services (
    temple_id INTEGER NOT NULL,
    puja_id INTEGER NOT NULL,

    is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (temple_id, puja_id),

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE,
    FOREIGN KEY (puja_id) REFERENCES puja_services(id) ON DELETE CASCADE
);


-- =========================================================
-- 16. ASHRAMS
-- =========================================================

CREATE TABLE IF NOT EXISTS ashrams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,
    short_name TEXT,

    founder TEXT,
    spiritual_head TEXT,

    tradition TEXT,
    founded TEXT,

    summary TEXT,
    description TEXT,
    history TEXT,
    activities_json TEXT NOT NULL DEFAULT '[]',
    stay TEXT,
    food TEXT,
    courses_json TEXT NOT NULL DEFAULT '[]',
    contact_note TEXT,

    image TEXT,
    gallery_json TEXT NOT NULL DEFAULT '[]',

    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT NOT NULL DEFAULT 'India',

    location_id INTEGER,

    -- Cached ancestry for country/state/district/city listing filters.
    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,

    address TEXT,
    latitude REAL,
    longitude REAL,
    map_url TEXT,

    contact_phone TEXT,
    contact_email TEXT,
    website_url TEXT,

    stay_available INTEGER NOT NULL DEFAULT 0 CHECK (stay_available IN (0, 1)),
    retreat_available INTEGER NOT NULL DEFAULT 0 CHECK (retreat_available IN (0, 1)),

    facilities_json TEXT NOT NULL DEFAULT '[]',
    programs_json TEXT NOT NULL DEFAULT '[]',
    timings_json TEXT NOT NULL DEFAULT '{}',

    booking_enabled INTEGER NOT NULL DEFAULT 0 CHECK (booking_enabled IN (0, 1)),

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    listing_active INTEGER NOT NULL DEFAULT 0 CHECK (listing_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 16.1 ASHRAM MANAGER PROFILES
-- =========================================================
-- One account can represent one or more Ashrams through explicit assignments.
-- The account-level profile stores the representative's designation and
-- verification state; Ashram ownership/assignment remains in the mapping table.

CREATE TABLE IF NOT EXISTS ashram_manager_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL UNIQUE,

    designation TEXT,
    organization_name TEXT,

    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            verification_status IN (
                'pending',
                'verified',
                'rejected',
                'suspended'
            )
        ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- =========================================================
-- 16.2 ASHRAM MANAGER ASSIGNMENTS
-- =========================================================
-- Admin-controlled assignment of an Ashram Manager to one or more Ashrams.

CREATE TABLE IF NOT EXISTS ashram_manager_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    ashram_id INTEGER NOT NULL,
    manager_user_id INTEGER NOT NULL,
    assigned_by INTEGER,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'inactive',
                'revoked'
            )
        ),

    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE CASCADE,
    FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,

    UNIQUE (ashram_id, manager_user_id)
);


-- =========================================================
-- 17. ASHRAM PROGRAMS
-- =========================================================

CREATE TABLE IF NOT EXISTS ashram_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    ashram_id INTEGER NOT NULL,

    title TEXT NOT NULL,
    slug TEXT,

    description TEXT,

    program_type TEXT,

    duration_text TEXT,
    price_amount INTEGER,
    currency TEXT NOT NULL DEFAULT 'INR',

    image TEXT,

    start_date TEXT,
    end_date TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE CASCADE
);


-- =========================================================
-- 18. YATRA PACKAGES
-- =========================================================

CREATE TABLE IF NOT EXISTS yatra_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,
    destination TEXT,

    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,

    package_type TEXT,

    short_description TEXT,
    description TEXT,

    image TEXT,
    gallery_json TEXT NOT NULL DEFAULT '[]',

    duration_days INTEGER,
    duration_nights INTEGER,
    duration_text TEXT,
    dates_json TEXT NOT NULL DEFAULT '[]',

    starting_price_amount INTEGER
        CHECK (
            starting_price_amount IS NULL
            OR starting_price_amount >= 0
        ),

    currency TEXT NOT NULL DEFAULT 'INR',

    discount_amount INTEGER DEFAULT 0
        CHECK (discount_amount >= 0),

    old_price_amount INTEGER
        CHECK (old_price_amount IS NULL OR old_price_amount >= 0),

    price_display TEXT,
    rating_text TEXT,
    group_size TEXT,
    meals TEXT,
    transport_text TEXT,
    stay_text TEXT,

    places_json TEXT NOT NULL DEFAULT '[]',
    terms_json TEXT NOT NULL DEFAULT '[]',

    inclusions_json TEXT NOT NULL DEFAULT '[]',
    exclusions_json TEXT NOT NULL DEFAULT '[]',
    highlights_json TEXT NOT NULL DEFAULT '[]',

    transport_json TEXT NOT NULL DEFAULT '{}',
    stay_json TEXT NOT NULL DEFAULT '{}',

    location_id INTEGER,

    booking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (booking_enabled IN (0, 1)),

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 19. YATRA PACKAGE LOCATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS yatra_package_locations (
    package_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,

    relation_type TEXT NOT NULL DEFAULT 'route'
        CHECK (
            relation_type IN (
                'origin',
                'route',
                'destination'
            )
        ),

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (package_id, location_id, relation_type),

    FOREIGN KEY (package_id) REFERENCES yatra_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);


-- =========================================================
-- 20. PACKAGE ITINERARIES
-- =========================================================

CREATE TABLE IF NOT EXISTS package_itineraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    package_id INTEGER NOT NULL,

    day_number INTEGER NOT NULL CHECK (day_number > 0),
    title TEXT NOT NULL,

    location_id INTEGER,

    description TEXT,
    meals TEXT,
    stay TEXT,
    transport TEXT,

    image TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (package_id) REFERENCES yatra_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 21. SPIRITUAL PLACES
-- =========================================================

CREATE TABLE IF NOT EXISTS spiritual_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,
    subtitle TEXT,

    place_type TEXT,
    significance TEXT,
    significance_json TEXT NOT NULL DEFAULT '[]',

    short_description TEXT,
    description TEXT,

    history TEXT,
    best_time TEXT,
    how_to_reach TEXT,
    reach TEXT,

    attractions_json TEXT NOT NULL DEFAULT '[]',
    nearby_json TEXT NOT NULL DEFAULT '[]',

    image TEXT,
    gallery_json TEXT NOT NULL DEFAULT '[]',

    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT NOT NULL DEFAULT 'India',

    location_id INTEGER,

    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,

    address TEXT,
    latitude REAL,
    longitude REAL,
    map_url TEXT,

    nearby_attractions_json TEXT NOT NULL DEFAULT '[]',
    travel_tips_json TEXT NOT NULL DEFAULT '[]',

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 22. EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    title TEXT NOT NULL,
    category TEXT,

    event_type TEXT,
    event_date TEXT,
    time_text TEXT,

    short_description TEXT,
    description TEXT,

    image TEXT,
    gallery_json TEXT NOT NULL DEFAULT '[]',

    start_date TEXT,
    end_date TEXT,

    venue TEXT,

    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT NOT NULL DEFAULT 'India',

    location_id INTEGER,

    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,

    address TEXT,
    latitude REAL,
    longitude REAL,
    map_url TEXT,

    organizer_name TEXT,
    organizer TEXT,
    fee TEXT,
    schedule_json TEXT NOT NULL DEFAULT '[]',

    contact_phone TEXT,
    contact_email TEXT,
    website_url TEXT,

    registration_enabled INTEGER NOT NULL DEFAULT 0 CHECK (registration_enabled IN (0, 1)),
    registration_url TEXT,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'cancelled',
                'completed',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 23. EVENT SCHEDULES
-- =========================================================

CREATE TABLE IF NOT EXISTS event_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    event_id INTEGER NOT NULL,

    schedule_date TEXT,
    start_time TEXT,
    end_time TEXT,

    title TEXT,
    description TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);


-- =========================================================
-- 24. GALLERY ITEMS
-- =========================================================

CREATE TABLE IF NOT EXISTS gallery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    title TEXT NOT NULL,
    tag TEXT,
    caption TEXT,
    description TEXT,

    cover_image TEXT,
    source_path TEXT,
    alt_text TEXT,

    content_type TEXT
        CHECK (
            content_type IS NULL
            OR content_type IN (
                'temple',
                'puja',
                'pandit',
                'ashram',
                'yatra',
                'event',
                'spiritual_place',
                'course',
                'general'
            )
        ),

    related_entity_type TEXT,
    related_entity_id INTEGER,

    location_id INTEGER,
    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,


    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 25. GALLERY MEDIA
-- =========================================================

CREATE TABLE IF NOT EXISTS gallery_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    gallery_item_id INTEGER NOT NULL,

    media_url TEXT NOT NULL,
    thumbnail_url TEXT,

    alt_text TEXT,
    caption TEXT,

    width INTEGER,
    height INTEGER,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (gallery_item_id) REFERENCES gallery_items(id) ON DELETE CASCADE
);


-- =========================================================
-- 26. VIDEOS
-- =========================================================
-- Public frontend can expose one single "All Videos" listing.

CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    title TEXT NOT NULL,

    short_description TEXT,
    description TEXT,

    -- Canonical provider plus legacy/admin compatibility aliases.
    provider TEXT,
    video_id TEXT,
    watch_url TEXT,

    video_provider TEXT NOT NULL DEFAULT 'youtube'
        CHECK (
            video_provider IN (
                'youtube',
                'vimeo',
                'self_hosted',
                'other'
            )
        ),

    video_url TEXT NOT NULL,
    embed_url TEXT,
    external_video_id TEXT,

    thumbnail_url TEXT,
    image TEXT,

    duration_text TEXT,

    duration_seconds INTEGER
        CHECK (
            duration_seconds IS NULL
            OR duration_seconds >= 0
        ),

    category TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',

    related_entity_type TEXT,
    related_entity_id INTEGER,

    related_temple_id INTEGER,
    related_pandit_id INTEGER,
    related_ashram_id INTEGER,
    related_puja_id INTEGER,
    related_event_id INTEGER,
    related_course_id INTEGER,

    location_id INTEGER,
    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,


    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (related_temple_id) REFERENCES temples(id) ON DELETE SET NULL,
    FOREIGN KEY (related_pandit_id) REFERENCES pandit_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (related_ashram_id) REFERENCES ashrams(id) ON DELETE SET NULL,
    FOREIGN KEY (related_puja_id) REFERENCES puja_services(id) ON DELETE SET NULL,
    FOREIGN KEY (related_event_id) REFERENCES events(id) ON DELETE SET NULL,
    FOREIGN KEY (related_course_id) REFERENCES courses(id) ON DELETE SET NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 27. COURSES
-- =========================================================

CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    title TEXT NOT NULL,
    subtitle TEXT,

    category TEXT,
    level TEXT,

    short_description TEXT,
    description TEXT,

    instructor_name TEXT,
    instructor_bio TEXT,
    instructor_image TEXT,

    image TEXT,
    gallery_json TEXT NOT NULL DEFAULT '[]',

    duration_text TEXT,
    sessions_text TEXT,
    fee_display TEXT,
    mode_text TEXT,
    schedule_text TEXT,
    eligibility_text TEXT,

    delivery_mode TEXT
        CHECK (
            delivery_mode IS NULL
            OR delivery_mode IN (
                'online',
                'offline',
                'hybrid',
                'residential'
            )
        ),

    price_amount INTEGER
        CHECK (
            price_amount IS NULL
            OR price_amount >= 0
        ),

    currency TEXT NOT NULL DEFAULT 'INR',

    certificate_available INTEGER NOT NULL DEFAULT 0
        CHECK (certificate_available IN (0, 1)),

    curriculum_json TEXT NOT NULL DEFAULT '[]',
    benefits_json TEXT NOT NULL DEFAULT '[]',

    location_id INTEGER,
    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,

    enrollment_enabled INTEGER NOT NULL DEFAULT 1 CHECK (enrollment_enabled IN (0, 1)),

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (country_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_location_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 28. COURSE LESSONS
-- =========================================================

CREATE TABLE IF NOT EXISTS course_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    course_id INTEGER NOT NULL,

    lesson_number INTEGER NOT NULL CHECK (lesson_number > 0),

    title TEXT NOT NULL,
    description TEXT,

    video_url TEXT,
    duration_minutes INTEGER,

    is_preview INTEGER NOT NULL DEFAULT 0 CHECK (is_preview IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);


-- =========================================================
-- 29. ASHRAM <-> COURSE RELATION
-- =========================================================

CREATE TABLE IF NOT EXISTS ashram_courses (
    ashram_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,

    is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (ashram_id, course_id),

    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);


-- =========================================================
-- 30. ARTICLES / WISDOM & GUIDES
-- =========================================================
-- Homepage currently exposes "Wisdom & Guides"; keep it dynamic too.

CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT NOT NULL UNIQUE,

    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL DEFAULT '',
    body_json TEXT NOT NULL DEFAULT '[]',
    article_date TEXT,

    category TEXT,
    author_name TEXT,
    author_user_id INTEGER,
    source_name TEXT,
    source_url TEXT,

    reading_time_minutes INTEGER,

    cover_image TEXT,
    gallery_json TEXT NOT NULL DEFAULT '[]',

    location_id INTEGER,
    country_location_id INTEGER,
    state_location_id INTEGER,
    district_location_id INTEGER,
    city_location_id INTEGER,


    related_entity_type TEXT,
    related_entity_id INTEGER,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),

    published_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 31. LIVE STREAMS / AARTI
-- =========================================================

CREATE TABLE IF NOT EXISTS live_streams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT NOT NULL,

    stream_provider TEXT NOT NULL DEFAULT 'youtube'
        CHECK (
            stream_provider IN (
                'youtube',
                'vimeo',
                'other'
            )
        ),

    stream_url TEXT NOT NULL,
    embed_url TEXT,

    thumbnail_url TEXT,

    related_temple_id INTEGER,

    schedule_label TEXT,
    start_time TEXT,
    end_time TEXT,

    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (
            status IN (
                'scheduled',
                'live',
                'ended',
                'disabled'
            )
        ),

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (related_temple_id) REFERENCES temples(id) ON DELETE SET NULL
);


-- =========================================================
-- 32. HOMEPAGE CONTENT
-- =========================================================

CREATE TABLE IF NOT EXISTS homepage_content (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    announcement_text TEXT,

    hero_badge TEXT,
    hero_title TEXT,
    hero_subtitle TEXT,

    hero_image TEXT,

    primary_cta_label TEXT,
    primary_cta_url TEXT,

    secondary_cta_label TEXT,
    secondary_cta_url TEXT,

    story_title TEXT,
    story_text TEXT,

    whatsapp_title TEXT,
    whatsapp_text TEXT,
    whatsapp_number TEXT,

    footer_tagline TEXT,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 33. HOMEPAGE STATS
-- =========================================================

CREATE TABLE IF NOT EXISTS homepage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    label TEXT NOT NULL,
    value TEXT NOT NULL,
    suffix TEXT,

    icon TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 34. HOMEPAGE SECTIONS
-- =========================================================
-- Controls headings/CTA/order for dynamic homepage modules.

CREATE TABLE IF NOT EXISTS homepage_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    section_key TEXT NOT NULL UNIQUE,

    eyebrow TEXT,
    title TEXT,
    subtitle TEXT,

    cta_label TEXT,
    cta_url TEXT,

    config_json TEXT NOT NULL DEFAULT '{}',

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 35. SUBSCRIPTION PLANS
-- =========================================================
-- FINAL COMMERCIAL PLANS
--   Pandit  : Basic ₹199/month | Premium ₹499/month
--   Temple  : Basic ₹499/month | Premium ₹999/month
--   Ashram  : Basic ₹499/month | Premium ₹1,499/month
--
-- price_amount is stored in INR rupees (integer). Payment records keep
-- paise separately. plan_features_json remains the presentation layer;
-- structured entitlement columns below are the enforcement layer.

CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    code TEXT NOT NULL UNIQUE,

    audience TEXT NOT NULL
        CHECK (audience IN ('pandit', 'temple', 'ashram')),

    name TEXT NOT NULL
        CHECK (name IN ('Basic', 'Premium')),

    description TEXT,

    price_amount INTEGER NOT NULL CHECK (price_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',

    billing_interval TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'quarterly', 'yearly', 'custom')),

    duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),

    -- Commercial quota.
    lead_limit INTEGER NOT NULL DEFAULT 0 CHECK (lead_limit >= 0),

    -- Structured entitlements.
    service_limit INTEGER NOT NULL DEFAULT 0 CHECK (service_limit >= 0),
    -- service_area_limit = 0 means unlimited service cities/areas.
    service_area_limit INTEGER NOT NULL DEFAULT 0 CHECK (service_area_limit >= 0),
    gallery_limit INTEGER NOT NULL DEFAULT 0 CHECK (gallery_limit >= 0),
    video_limit INTEGER NOT NULL DEFAULT 0 CHECK (video_limit >= 0),
    program_limit INTEGER NOT NULL DEFAULT 0 CHECK (program_limit >= 0),

    listing_enabled INTEGER NOT NULL DEFAULT 1 CHECK (listing_enabled IN (0, 1)),
    featured_listing INTEGER NOT NULL DEFAULT 0 CHECK (featured_listing IN (0, 1)),
    priority_support INTEGER NOT NULL DEFAULT 0 CHECK (priority_support IN (0, 1)),
    verification_badge INTEGER NOT NULL DEFAULT 0 CHECK (verification_badge IN (0, 1)),
    analytics_access INTEGER NOT NULL DEFAULT 0 CHECK (analytics_access IN (0, 1)),
    homepage_promotion INTEGER NOT NULL DEFAULT 0 CHECK (homepage_promotion IN (0, 1)),
    live_aarti_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_aarti_enabled IN (0, 1)),
    enhanced_seo INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_seo IN (0, 1)),
    enhanced_profile INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_profile IN (0, 1)),
    whatsapp_enquiry INTEGER NOT NULL DEFAULT 1 CHECK (whatsapp_enquiry IN (0, 1)),

    search_visibility TEXT NOT NULL DEFAULT 'standard'
        CHECK (search_visibility IN ('standard', 'higher')),

    analytics_level TEXT NOT NULL DEFAULT 'none'
        CHECK (analytics_level IN ('none', 'basic', 'advanced')),

    plan_features_json TEXT NOT NULL DEFAULT '[]',

    razorpay_plan_id TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (audience, name)
);


-- =========================================================
-- 36. PANDIT SUBSCRIPTIONS
-- =========================================================

-- =========================================================
-- 35.1 SUBSCRIPTION PLAN PRICE VARIANTS
-- =========================================================
-- A commercial plan may expose monthly/quarterly/yearly/custom prices.
-- Annual amounts are intentionally not seeded unless supplied by the business.

CREATE TABLE IF NOT EXISTS subscription_plan_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    plan_id INTEGER NOT NULL,

    billing_interval TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'quarterly', 'yearly', 'custom')),

    duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),

    price_amount INTEGER NOT NULL CHECK (price_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',

    provider TEXT NOT NULL DEFAULT 'razorpay',
    razorpay_plan_id TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,

    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,

    UNIQUE (plan_id, billing_interval)
);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_prices_plan
    ON subscription_plan_prices(plan_id, is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_plan_prices_interval
    ON subscription_plan_prices(billing_interval, is_active);


CREATE TABLE IF NOT EXISTS pandit_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    pandit_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    subscription_plan_price_id INTEGER,
    billing_interval TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'quarterly', 'yearly', 'custom')),
    duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'paused', 'payment_failed')),

    starts_at TEXT,
    expires_at TEXT,

    lead_limit INTEGER NOT NULL DEFAULT 0 CHECK (lead_limit >= 0),
    leads_used INTEGER NOT NULL DEFAULT 0 CHECK (leads_used >= 0),

    -- Frozen entitlement snapshot so later admin plan edits do not rewrite
    -- the commercial terms of an already-paid subscription.
    price_amount INTEGER NOT NULL DEFAULT 0 CHECK (price_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    service_limit INTEGER NOT NULL DEFAULT 0 CHECK (service_limit >= 0),
    service_area_limit INTEGER NOT NULL DEFAULT 0 CHECK (service_area_limit >= 0),
    gallery_limit INTEGER NOT NULL DEFAULT 0 CHECK (gallery_limit >= 0),
    video_limit INTEGER NOT NULL DEFAULT 0 CHECK (video_limit >= 0),
    program_limit INTEGER NOT NULL DEFAULT 0 CHECK (program_limit >= 0),

    auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1)),

    payment_order_id INTEGER,
    payment_id INTEGER,

    listing_enabled INTEGER NOT NULL DEFAULT 1 CHECK (listing_enabled IN (0, 1)),
    featured_listing INTEGER NOT NULL DEFAULT 0 CHECK (featured_listing IN (0, 1)),
    priority_support INTEGER NOT NULL DEFAULT 0 CHECK (priority_support IN (0, 1)),
    verification_badge INTEGER NOT NULL DEFAULT 0 CHECK (verification_badge IN (0, 1)),
    analytics_access INTEGER NOT NULL DEFAULT 0 CHECK (analytics_access IN (0, 1)),
    homepage_promotion INTEGER NOT NULL DEFAULT 0 CHECK (homepage_promotion IN (0, 1)),
    live_aarti_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_aarti_enabled IN (0, 1)),
    enhanced_seo INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_seo IN (0, 1)),
    enhanced_profile INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_profile IN (0, 1)),
    whatsapp_enquiry INTEGER NOT NULL DEFAULT 1 CHECK (whatsapp_enquiry IN (0, 1)),
    search_visibility TEXT NOT NULL DEFAULT 'standard' CHECK (search_visibility IN ('standard', 'higher')),
    analytics_level TEXT NOT NULL DEFAULT 'none' CHECK (analytics_level IN ('none', 'basic', 'advanced')),

    razorpay_subscription_id TEXT,

    plan_snapshot_json TEXT NOT NULL DEFAULT '{}',

    notes TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    FOREIGN KEY (subscription_plan_price_id) REFERENCES subscription_plan_prices(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);


-- =========================================================
-- 37. TEMPLE SUBSCRIPTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    temple_id INTEGER NOT NULL,
    manager_user_id INTEGER,
    plan_id INTEGER NOT NULL,
    subscription_plan_price_id INTEGER,
    billing_interval TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'quarterly', 'yearly', 'custom')),
    duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'paused', 'payment_failed')),

    starts_at TEXT,
    expires_at TEXT,

    lead_limit INTEGER NOT NULL DEFAULT 0 CHECK (lead_limit >= 0),
    leads_used INTEGER NOT NULL DEFAULT 0 CHECK (leads_used >= 0),

    price_amount INTEGER NOT NULL DEFAULT 0 CHECK (price_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    service_limit INTEGER NOT NULL DEFAULT 0 CHECK (service_limit >= 0),
    service_area_limit INTEGER NOT NULL DEFAULT 0 CHECK (service_area_limit >= 0),
    gallery_limit INTEGER NOT NULL DEFAULT 0 CHECK (gallery_limit >= 0),
    video_limit INTEGER NOT NULL DEFAULT 0 CHECK (video_limit >= 0),
    program_limit INTEGER NOT NULL DEFAULT 0 CHECK (program_limit >= 0),

    auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1)),

    payment_order_id INTEGER,
    payment_id INTEGER,

    listing_enabled INTEGER NOT NULL DEFAULT 1 CHECK (listing_enabled IN (0, 1)),
    featured_listing INTEGER NOT NULL DEFAULT 0 CHECK (featured_listing IN (0, 1)),
    priority_support INTEGER NOT NULL DEFAULT 0 CHECK (priority_support IN (0, 1)),
    verification_badge INTEGER NOT NULL DEFAULT 0 CHECK (verification_badge IN (0, 1)),
    analytics_access INTEGER NOT NULL DEFAULT 0 CHECK (analytics_access IN (0, 1)),
    homepage_promotion INTEGER NOT NULL DEFAULT 0 CHECK (homepage_promotion IN (0, 1)),
    live_aarti_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_aarti_enabled IN (0, 1)),
    enhanced_seo INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_seo IN (0, 1)),
    enhanced_profile INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_profile IN (0, 1)),
    whatsapp_enquiry INTEGER NOT NULL DEFAULT 1 CHECK (whatsapp_enquiry IN (0, 1)),
    search_visibility TEXT NOT NULL DEFAULT 'standard' CHECK (search_visibility IN ('standard', 'higher')),
    analytics_level TEXT NOT NULL DEFAULT 'none' CHECK (analytics_level IN ('none', 'basic', 'advanced')),

    razorpay_subscription_id TEXT,

    plan_snapshot_json TEXT NOT NULL DEFAULT '{}',
    notes TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE,
    FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    FOREIGN KEY (subscription_plan_price_id) REFERENCES subscription_plan_prices(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);


-- =========================================================
-- 38. ASHRAM SUBSCRIPTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS ashram_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    ashram_id INTEGER NOT NULL,
    manager_user_id INTEGER,
    plan_id INTEGER NOT NULL,
    subscription_plan_price_id INTEGER,
    billing_interval TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'quarterly', 'yearly', 'custom')),
    duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'paused', 'payment_failed')),

    starts_at TEXT,
    expires_at TEXT,

    lead_limit INTEGER NOT NULL DEFAULT 0 CHECK (lead_limit >= 0),
    leads_used INTEGER NOT NULL DEFAULT 0 CHECK (leads_used >= 0),

    price_amount INTEGER NOT NULL DEFAULT 0 CHECK (price_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    service_limit INTEGER NOT NULL DEFAULT 0 CHECK (service_limit >= 0),
    service_area_limit INTEGER NOT NULL DEFAULT 0 CHECK (service_area_limit >= 0),
    gallery_limit INTEGER NOT NULL DEFAULT 0 CHECK (gallery_limit >= 0),
    video_limit INTEGER NOT NULL DEFAULT 0 CHECK (video_limit >= 0),
    program_limit INTEGER NOT NULL DEFAULT 0 CHECK (program_limit >= 0),

    auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1)),

    payment_order_id INTEGER,
    payment_id INTEGER,

    listing_enabled INTEGER NOT NULL DEFAULT 1 CHECK (listing_enabled IN (0, 1)),
    featured_listing INTEGER NOT NULL DEFAULT 0 CHECK (featured_listing IN (0, 1)),
    priority_support INTEGER NOT NULL DEFAULT 0 CHECK (priority_support IN (0, 1)),
    verification_badge INTEGER NOT NULL DEFAULT 0 CHECK (verification_badge IN (0, 1)),
    analytics_access INTEGER NOT NULL DEFAULT 0 CHECK (analytics_access IN (0, 1)),
    homepage_promotion INTEGER NOT NULL DEFAULT 0 CHECK (homepage_promotion IN (0, 1)),
    live_aarti_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_aarti_enabled IN (0, 1)),
    enhanced_seo INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_seo IN (0, 1)),
    enhanced_profile INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_profile IN (0, 1)),
    whatsapp_enquiry INTEGER NOT NULL DEFAULT 1 CHECK (whatsapp_enquiry IN (0, 1)),
    search_visibility TEXT NOT NULL DEFAULT 'standard' CHECK (search_visibility IN ('standard', 'higher')),
    analytics_level TEXT NOT NULL DEFAULT 'none' CHECK (analytics_level IN ('none', 'basic', 'advanced')),

    razorpay_subscription_id TEXT,

    plan_snapshot_json TEXT NOT NULL DEFAULT '{}',
    notes TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE CASCADE,
    FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    FOREIGN KEY (subscription_plan_price_id) REFERENCES subscription_plan_prices(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);


-- =========================================================
-- 39. ACTIVE SUBSCRIPTION UNIQUENESS + PLAN AUDIENCE GUARDS
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_subscription_per_pandit
ON pandit_subscriptions(pandit_id)
WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_subscription_per_temple
ON temple_subscriptions(temple_id)
WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_subscription_per_ashram
ON ashram_subscriptions(ashram_id)
WHERE status = 'active';

CREATE TRIGGER IF NOT EXISTS trg_pandit_subscription_plan_audience_insert
BEFORE INSERT ON pandit_subscriptions
WHEN (SELECT audience FROM subscription_plans WHERE id = NEW.plan_id) <> 'pandit'
BEGIN
    SELECT RAISE(ABORT, 'Pandit subscription requires a pandit plan');
END;

CREATE TRIGGER IF NOT EXISTS trg_pandit_subscription_plan_audience_update
BEFORE UPDATE OF plan_id ON pandit_subscriptions
WHEN (SELECT audience FROM subscription_plans WHERE id = NEW.plan_id) <> 'pandit'
BEGIN
    SELECT RAISE(ABORT, 'Pandit subscription requires a pandit plan');
END;

CREATE TRIGGER IF NOT EXISTS trg_temple_subscription_plan_audience_insert
BEFORE INSERT ON temple_subscriptions
WHEN (SELECT audience FROM subscription_plans WHERE id = NEW.plan_id) <> 'temple'
BEGIN
    SELECT RAISE(ABORT, 'Temple subscription requires a temple plan');
END;

CREATE TRIGGER IF NOT EXISTS trg_temple_subscription_plan_audience_update
BEFORE UPDATE OF plan_id ON temple_subscriptions
WHEN (SELECT audience FROM subscription_plans WHERE id = NEW.plan_id) <> 'temple'
BEGIN
    SELECT RAISE(ABORT, 'Temple subscription requires a temple plan');
END;

CREATE TRIGGER IF NOT EXISTS trg_ashram_subscription_plan_audience_insert
BEFORE INSERT ON ashram_subscriptions
WHEN (SELECT audience FROM subscription_plans WHERE id = NEW.plan_id) <> 'ashram'
BEGIN
    SELECT RAISE(ABORT, 'Ashram subscription requires an ashram plan');
END;

CREATE TRIGGER IF NOT EXISTS trg_ashram_subscription_plan_audience_update
BEFORE UPDATE OF plan_id ON ashram_subscriptions
WHEN (SELECT audience FROM subscription_plans WHERE id = NEW.plan_id) <> 'ashram'
BEGIN
    SELECT RAISE(ABORT, 'Ashram subscription requires an ashram plan');
END;


-- 40. LEADS
-- =========================================================

CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lead_number TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,

    city TEXT,
    state TEXT,

    service_type TEXT,
    puja_type TEXT,

    temple_id INTEGER,
    requested_pandit_id INTEGER,
    ashram_id INTEGER,
    puja_service_id INTEGER,
    yatra_package_id INTEGER,
    event_id INTEGER,
    course_id INTEGER,
    spiritual_place_id INTEGER,

    country TEXT,
    district TEXT,

    preferred_date TEXT,
    preferred_time TEXT,

    travellers_count INTEGER,

    message TEXT,

    source_type TEXT NOT NULL DEFAULT 'website'
        CHECK (
            source_type IN (
                'website',
                'form',
                'whatsapp',
                'phone',
                'admin',
                'organic_search',
                'paid_search',
                'social',
                'email',
                'referral',
                'direct',
                'video',
                'gallery',
                'seo_landing'
            )
        ),

    source_page TEXT,
    source_form TEXT,

    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    landing_page TEXT,
    referrer_url TEXT,

    user_id INTEGER,
    visitor_id INTEGER,
    session_id INTEGER,
    contact_preference TEXT
        CHECK (contact_preference IS NULL OR contact_preference IN ('call', 'whatsapp', 'email', 'any')),
    whatsapp_consent INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_consent IN (0, 1)),
    marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
    lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score >= 0),
    lead_temperature TEXT NOT NULL DEFAULT 'cold'
        CHECK (lead_temperature IN ('cold', 'warm', 'hot')),
    last_activity_at TEXT,
    form_key TEXT,
    source_submission_id INTEGER,

    status TEXT NOT NULL DEFAULT 'new'
        CHECK (
            status IN (
                'new',
                'qualified',
                'assigned',
                'contacted',
                'follow_up',
                'converted',
                'lost',
                'closed',
                'spam'
            )
        ),

    priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (
            priority IN (
                'low',
                'normal',
                'high',
                'urgent'
            )
        ),

    owner_user_id INTEGER,

    last_contacted_at TEXT,
    converted_at TEXT,
    closed_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_pandit_id) REFERENCES pandit_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE SET NULL,
    FOREIGN KEY (puja_service_id) REFERENCES puja_services(id) ON DELETE SET NULL,
    FOREIGN KEY (yatra_package_id) REFERENCES yatra_packages(id) ON DELETE SET NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    FOREIGN KEY (spiritual_place_id) REFERENCES spiritual_places(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (source_submission_id) REFERENCES form_submissions(id) ON DELETE SET NULL
);


-- =========================================================
-- 40.1 AUTH IDENTITIES
-- =========================================================
-- Firebase/Auth-provider identities are mapped separately from users.
-- OTP codes/tokens are NEVER stored in SQLite. Only the verified provider
-- subject and associated identity metadata are persisted.

CREATE TABLE IF NOT EXISTS auth_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    provider TEXT NOT NULL DEFAULT 'firebase',
    identity_type TEXT NOT NULL DEFAULT 'phone'
        CHECK (identity_type IN ('phone', 'email', 'other')),

    provider_subject TEXT NOT NULL,

    user_id INTEGER,
    visitor_id INTEGER,

    phone_e164 TEXT,
    email TEXT,

    status TEXT NOT NULL DEFAULT 'verified'
        CHECK (status IN ('pending', 'verified', 'revoked')),

    verified_at TEXT,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,

    UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user
    ON auth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_visitor
    ON auth_identities(visitor_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_provider
    ON auth_identities(provider, identity_type, status);


-- =========================================================
-- 40.2 LEAD CAPTURE SESSIONS
-- =========================================================
-- Stateful lead-capture flow used by detail-page gates and future chatbot
-- capture. Firebase owns OTP verification; this row tracks business state.

CREATE TABLE IF NOT EXISTS lead_capture_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    capture_key TEXT NOT NULL UNIQUE,

    capture_surface TEXT NOT NULL DEFAULT 'detail_gate'
        CHECK (capture_surface IN ('detail_gate', 'direct_form', 'chatbot', 'other')),

    module TEXT NOT NULL
        CHECK (module IN ('temple', 'pandit', 'puja_service', 'ashram', 'yatra', 'spiritual_place', 'event', 'course', 'kundli', 'other')),

    entity_type TEXT,
    entity_id INTEGER,

    source_path TEXT,
    target_path TEXT,

    visitor_id INTEGER,
    session_id INTEGER,
    page_view_id INTEGER,
    user_id INTEGER,
    auth_identity_id INTEGER,

    name TEXT,
    email TEXT,
    phone TEXT,

    verification_provider TEXT DEFAULT 'firebase',
    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('not_required', 'pending', 'verified', 'failed', 'expired')),
    phone_verified_at TEXT,

    status TEXT NOT NULL DEFAULT 'started'
        CHECK (status IN ('started', 'otp_pending', 'verified', 'submitted', 'abandoned', 'expired', 'failed', 'duplicate')),

    lead_id INTEGER,
    contact_preference TEXT
        CHECK (contact_preference IS NULL OR contact_preference IN ('call', 'whatsapp', 'email', 'any')),
    whatsapp_consent INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_consent IN (0, 1)),
    marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),

    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),

    metadata_json TEXT NOT NULL DEFAULT '{}',

    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (page_view_id) REFERENCES web_page_views(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (auth_identity_id) REFERENCES auth_identities(id) ON DELETE SET NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);


-- =========================================================
-- 40.3 LEAD CAPTURE SIGNALS
-- =========================================================
-- Structured signals from web forms, sales and AI. This lets Phase 3 build
-- advanced lead scoring without stuffing every possible attribute into leads.

CREATE TABLE IF NOT EXISTS lead_capture_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lead_id INTEGER,
    capture_session_id INTEGER,
    ai_conversation_id INTEGER,

    visitor_id INTEGER,
    session_id INTEGER,
    user_id INTEGER,

    source TEXT NOT NULL DEFAULT 'web'
        CHECK (source IN ('web', 'form', 'chatbot', 'sales', 'system')),

    module TEXT,
    entity_type TEXT,
    entity_id INTEGER,

    signal_type TEXT NOT NULL,
    signal_key TEXT NOT NULL,

    value_text TEXT,
    value_number REAL,
    value_json TEXT,
    confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

    metadata_json TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (capture_session_id) REFERENCES lead_capture_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (ai_conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL,
    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 41. LEAD ASSIGNMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lead_id INTEGER NOT NULL,

    pandit_id INTEGER,

    assigned_to_user_id INTEGER,
    assigned_by INTEGER,

    -- Legacy Pandit-only link retained for compatibility.
    subscription_id INTEGER,

    pandit_subscription_id INTEGER,
    temple_subscription_id INTEGER,
    ashram_subscription_id INTEGER,

    assignment_type TEXT NOT NULL DEFAULT 'pandit'
        CHECK (
            assignment_type IN (
                'pandit',
                'sales',
                'temple_manager',
                'ashram_manager',
                'admin'
            )
        ),

    status TEXT NOT NULL DEFAULT 'assigned'
        CHECK (
            status IN (
                'assigned',
                'accepted',
                'contacted',
                'follow_up',
                'converted',
                'rejected',
                'expired',
                'closed'
            )
        ),

    lead_credit_used INTEGER NOT NULL DEFAULT 0 CHECK (lead_credit_used IN (0, 1)),
    credit_consumed_at TEXT,

    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    contacted_at TEXT,
    converted_at TEXT,
    closed_at TEXT,

    notes TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (subscription_id) REFERENCES pandit_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (pandit_subscription_id) REFERENCES pandit_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_subscription_id) REFERENCES temple_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_subscription_id) REFERENCES ashram_subscriptions(id) ON DELETE SET NULL,

    UNIQUE (lead_id, pandit_id)
);


-- =========================================================
-- 42. LEAD EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lead_id INTEGER NOT NULL,
    assignment_id INTEGER,
    user_id INTEGER,

    event_type TEXT NOT NULL,

    old_status TEXT,
    new_status TEXT,

    notes TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES lead_assignments(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 43. BOOKINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    booking_number TEXT NOT NULL UNIQUE,

    user_id INTEGER,

    lead_id INTEGER,

    pandit_id INTEGER,
    temple_id INTEGER,
    ashram_id INTEGER,

    puja_id INTEGER,
    package_id INTEGER,
    course_id INTEGER,
    event_id INTEGER,

    kind TEXT NOT NULL,
    title TEXT NOT NULL,

    date TEXT,
    time TEXT,

    status TEXT NOT NULL DEFAULT 'received'
        CHECK (
            status IN (
                'received',
                'confirmed',
                'in_progress',
                'completed',
                'cancelled',
                'rejected'
            )
        ),

    detail TEXT,

    amount INTEGER
        CHECK (
            amount IS NULL
            OR amount >= 0
        ),

    currency TEXT NOT NULL DEFAULT 'INR',

    payment_status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (
            payment_status IN (
                'unpaid',
                'pending',
                'paid',
                'partially_paid',
                'refunded',
                'failed'
            )
        ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE SET NULL,
    FOREIGN KEY (puja_id) REFERENCES puja_services(id) ON DELETE SET NULL,
    FOREIGN KEY (package_id) REFERENCES yatra_packages(id) ON DELETE SET NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);


-- =========================================================
-- 44. PAYMENT ORDERS
-- =========================================================
-- Internal order ledger before a payment is captured.

CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    order_number TEXT NOT NULL UNIQUE,

    user_id INTEGER,

    plan_id INTEGER,
    subscription_plan_price_id INTEGER,

    pandit_subscription_id INTEGER,
    temple_subscription_id INTEGER,
    ashram_subscription_id INTEGER,

    booking_id INTEGER,

    purpose TEXT NOT NULL DEFAULT 'subscription'
        CHECK (
            purpose IN (
                'subscription',
                'booking',
                'puja',
                'donation',
                'other'
            )
        ),

    amount INTEGER NOT NULL CHECK (amount >= 0),
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),

    currency TEXT NOT NULL DEFAULT 'INR',

    provider TEXT NOT NULL DEFAULT 'razorpay',

    provider_order_id TEXT UNIQUE,

    status TEXT NOT NULL DEFAULT 'created'
        CHECK (
            status IN (
                'created',
                'attempted',
                'paid',
                'failed',
                'cancelled',
                'expired'
            )
        ),

    receipt TEXT,

    notes_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}',

    expires_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
    FOREIGN KEY (subscription_plan_price_id) REFERENCES subscription_plan_prices(id) ON DELETE SET NULL,
    FOREIGN KEY (pandit_subscription_id) REFERENCES pandit_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_subscription_id) REFERENCES temple_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_subscription_id) REFERENCES ashram_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);


-- =========================================================
-- 45. PAYMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    payment_number TEXT NOT NULL UNIQUE,

    user_id INTEGER,

    pandit_id INTEGER,
    temple_id INTEGER,
    ashram_id INTEGER,

    pandit_subscription_id INTEGER,
    temple_subscription_id INTEGER,
    ashram_subscription_id INTEGER,

    -- Legacy compatibility field for existing Pandit code.
    subscription_id INTEGER,

    plan_id INTEGER,
    subscription_plan_price_id INTEGER,
    booking_id INTEGER,
    payment_order_id INTEGER,

    purpose TEXT NOT NULL DEFAULT 'subscription'
        CHECK (
            purpose IN (
                'subscription',
                'booking',
                'puja',
                'donation',
                'other'
            )
        ),

    entity_type TEXT
        CHECK (
            entity_type IS NULL
            OR entity_type IN (
                'pandit_subscription',
                'temple_subscription',
                'ashram_subscription',
                'booking',
                'puja',
                'other'
            )
        ),

    entity_id INTEGER,

    amount INTEGER NOT NULL CHECK (amount >= 0),

    amount_paise INTEGER
        CHECK (
            amount_paise IS NULL
            OR amount_paise >= 0
        ),

    currency TEXT NOT NULL DEFAULT 'INR',

    provider TEXT NOT NULL DEFAULT 'razorpay',

    provider_order_id TEXT,
    provider_payment_id TEXT,
    provider_signature TEXT,

    idempotency_key TEXT UNIQUE,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'created',
                'pending',
                'authorized',
                'paid',
                'captured',
                'failed',
                'refunded',
                'partially_refunded',
                'cancelled'
            )
        ),

    payment_method TEXT,

    paid_at TEXT,
    failed_at TEXT,

    failure_reason TEXT,

    refund_amount_paise INTEGER NOT NULL DEFAULT 0
        CHECK (refund_amount_paise >= 0),

    refunded_at TEXT,

    receipt TEXT,

    checkout_payload_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE SET NULL,

    FOREIGN KEY (pandit_subscription_id) REFERENCES pandit_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_subscription_id) REFERENCES temple_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_subscription_id) REFERENCES ashram_subscriptions(id) ON DELETE SET NULL,

    FOREIGN KEY (subscription_id) REFERENCES pandit_subscriptions(id) ON DELETE SET NULL,

    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
    FOREIGN KEY (subscription_plan_price_id) REFERENCES subscription_plan_prices(id) ON DELETE SET NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE SET NULL
);


-- =========================================================
-- 46. PAYMENT LINKS
-- =========================================================
-- Optional Razorpay Payment Link support.
-- Useful when the business wants a direct hosted UPI/payment URL.

CREATE TABLE IF NOT EXISTS payment_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    link_number TEXT NOT NULL UNIQUE,

    user_id INTEGER,

    plan_id INTEGER,
    subscription_plan_price_id INTEGER,

    pandit_subscription_id INTEGER,
    temple_subscription_id INTEGER,
    ashram_subscription_id INTEGER,

    purpose TEXT NOT NULL DEFAULT 'subscription'
        CHECK (
            purpose IN (
                'subscription',
                'booking',
                'puja',
                'donation',
                'other'
            )
        ),

    amount INTEGER NOT NULL CHECK (amount >= 0),
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),

    currency TEXT NOT NULL DEFAULT 'INR',

    provider TEXT NOT NULL DEFAULT 'razorpay',

    provider_link_id TEXT UNIQUE,
    provider_link_url TEXT,

    status TEXT NOT NULL DEFAULT 'created'
        CHECK (
            status IN (
                'created',
                'active',
                'paid',
                'expired',
                'cancelled'
            )
        ),

    short_url TEXT,
    expire_by TEXT,

    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
    FOREIGN KEY (subscription_plan_price_id) REFERENCES subscription_plan_prices(id) ON DELETE SET NULL,
    FOREIGN KEY (pandit_subscription_id) REFERENCES pandit_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_subscription_id) REFERENCES temple_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_subscription_id) REFERENCES ashram_subscriptions(id) ON DELETE SET NULL
);


-- =========================================================
-- 47. PAYMENT WEBHOOK EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    provider TEXT NOT NULL DEFAULT 'razorpay',

    provider_event_id TEXT,

    event_type TEXT NOT NULL,

    signature TEXT,

    payload_json TEXT NOT NULL,

    payload_hash TEXT,

    status TEXT NOT NULL DEFAULT 'received'
        CHECK (
            status IN (
                'received',
                'processed',
                'ignored',
                'failed'
            )
        ),

    processed_at TEXT,

    error_message TEXT,

    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (provider, provider_event_id)
);


-- =========================================================
-- 48. SUBSCRIPTION EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS subscription_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    subscription_type TEXT NOT NULL
        CHECK (
            subscription_type IN (
                'pandit',
                'temple',
                'ashram'
            )
        ),

    subscription_id INTEGER NOT NULL,

    payment_order_id INTEGER,
    payment_id INTEGER,

    user_id INTEGER,

    event_type TEXT NOT NULL,

    old_status TEXT,
    new_status TEXT,

    old_expires_at TEXT,
    new_expires_at TEXT,

    notes TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);


-- =========================================================
-- 49. NOTIFICATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    type TEXT NOT NULL DEFAULT 'system',

    title TEXT NOT NULL,
    message TEXT NOT NULL,

    action_url TEXT,

    is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    read_at TEXT,

    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- =========================================================
-- 50. SESSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,

    ip_address TEXT,
    user_agent TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TEXT,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- =========================================================
-- 51. PASSWORD RESET TOKENS
-- =========================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,

    used_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- =========================================================
-- 52. VERIFICATION TOKENS
-- =========================================================

CREATE TABLE IF NOT EXISTS verification_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    purpose TEXT NOT NULL
        CHECK (
            purpose IN (
                'email_verification',
                'phone_verification'
            )
        ),

    expires_at TEXT NOT NULL,
    verified_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- =========================================================
-- 53. SAVED TEMPLES
-- =========================================================

CREATE TABLE IF NOT EXISTS saved_temples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,
    temple_id INTEGER NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE CASCADE,

    UNIQUE (user_id, temple_id)
);


-- =========================================================
-- 54. SAVED PLACES
-- =========================================================

CREATE TABLE IF NOT EXISTS saved_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    place_slug TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    UNIQUE (user_id, place_slug)
);


-- =========================================================
-- 55. SALES ACTIVITIES
-- =========================================================

CREATE TABLE IF NOT EXISTS sales_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    sales_user_id INTEGER NOT NULL,

    lead_id INTEGER,

    pandit_id INTEGER,
    temple_id INTEGER,
    ashram_id INTEGER,

    activity_type TEXT NOT NULL
        CHECK (
            activity_type IN (
                'call',
                'whatsapp',
                'email',
                'meeting',
                'follow_up',
                'note',
                'package_discussion',
                'renewal'
            )
        ),

    outcome TEXT,
    notes TEXT,

    next_follow_up_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sales_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE SET NULL
);


-- =========================================================
-- 56. AUDIT LOGS
-- =========================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- user_id is nullable intentionally: anonymous/system actions can be
    -- linked through visitor_id/session_id/request_id instead.
    user_id INTEGER,
    visitor_id INTEGER,
    session_id INTEGER,
    request_id TEXT,

    actor_type TEXT NOT NULL DEFAULT 'system'
        CHECK (actor_type IN ('anonymous', 'registered', 'pandit', 'temple_manager', 'ashram_manager', 'sales', 'super_admin', 'system')),

    action TEXT NOT NULL,

    entity_type TEXT,
    entity_id INTEGER,

    old_data_json TEXT,
    new_data_json TEXT,

    ip_address TEXT,
    user_agent TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL
);


-- =========================================================
-- 57. SYSTEM SETTINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    setting_key TEXT NOT NULL UNIQUE,

    setting_value TEXT,

    setting_type TEXT NOT NULL DEFAULT 'string'
        CHECK (
            setting_type IN (
                'string',
                'number',
                'boolean',
                'json'
            )
        ),

    description TEXT,

    is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 57.1 CENTRAL CONTENT SOURCE REGISTRY
-- =========================================================
-- Maps database entities to src/data/* source records. This lets the
-- application migrate from static catalogue data to a DB-backed CMS without
-- losing the original source key/file relationship.

CREATE TABLE IF NOT EXISTS content_sync_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    content_type TEXT NOT NULL
        CHECK (content_type IN (
            'temple', 'pandit', 'puja_service', 'ashram', 'yatra',
            'spiritual_place', 'event', 'gallery', 'video', 'course',
            'article'
        )),

    source_file TEXT NOT NULL,
    source_key TEXT NOT NULL,
    entity_id INTEGER,

    source_hash TEXT,
    source_version INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (sync_status IN ('pending', 'synced', 'changed', 'failed', 'ignored')),
    last_error TEXT,
    last_synced_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (content_type, source_file, source_key)
);


-- =========================================================
-- 58. SEO ENTRIES
-- =========================================================
-- This is the central SEO table.
--
-- Entity page:
--   entity_type + entity_id
--
-- State page:
--   state_id
--
-- City page:
--   state_id + city_id
--
-- One path is always unique.

CREATE TABLE IF NOT EXISTS seo_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    path TEXT NOT NULL UNIQUE,

    page_type TEXT NOT NULL DEFAULT 'page',

    entity_type TEXT,
    entity_id INTEGER,

    country_id INTEGER,
    state_id INTEGER,
    district_id INTEGER,
    city_id INTEGER,
    area_id INTEGER,

    location_level TEXT
        CHECK (
            location_level IS NULL
            OR location_level IN ('country', 'state', 'district', 'city', 'area')
        ),

    seo_title TEXT,
    meta_description TEXT,
    h1 TEXT,
    intro_content TEXT,
    body_content TEXT,
    faq_json TEXT NOT NULL DEFAULT '[]',
    breadcrumb_json TEXT NOT NULL DEFAULT '[]',

    canonical_url TEXT,
    canonical_locked INTEGER NOT NULL DEFAULT 0 CHECK (canonical_locked IN (0, 1)),

    og_title TEXT,
    og_description TEXT,
    og_image TEXT,

    twitter_card TEXT DEFAULT 'summary_large_image',
    twitter_title TEXT,
    twitter_description TEXT,
    twitter_image TEXT,

    robots TEXT NOT NULL DEFAULT 'index,follow',

    schema_json TEXT NOT NULL DEFAULT '{}',
    schema_type TEXT,
    hreflang_json TEXT NOT NULL DEFAULT '{}',
    image_alt TEXT,

    focus_keyword TEXT,

    -- TempleSEO/front catalogue compatibility. These can be stored as JSON arrays.
    area TEXT,
    location_label TEXT,
    keywords_json TEXT NOT NULL DEFAULT '[]',
    primary_keywords_json TEXT NOT NULL DEFAULT '[]',
    location_keywords_json TEXT NOT NULL DEFAULT '[]',
    long_tail_keywords_json TEXT NOT NULL DEFAULT '[]',
    search_intents_json TEXT NOT NULL DEFAULT '[]',

    is_indexable INTEGER NOT NULL DEFAULT 1 CHECK (is_indexable IN (0, 1)),
    noindex_reason TEXT,
    quality_score INTEGER CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
    content_hash TEXT,
    sitemap_priority REAL CHECK (sitemap_priority IS NULL OR sitemap_priority BETWEEN 0 AND 1),
    sitemap_changefreq TEXT,
    lastmod_at TEXT,
    published_at TEXT,

    status TEXT NOT NULL DEFAULT 'published'
        CHECK (
            status IN (
                'draft',
                'published',
                'unpublished'
            )
        ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (country_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (state_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (district_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (area_id) REFERENCES locations(id) ON DELETE SET NULL
);


-- =========================================================
-- 59. SEO CONTENT BLOCKS
-- =========================================================

CREATE TABLE IF NOT EXISTS seo_content_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    seo_entry_id INTEGER NOT NULL,

    block_key TEXT NOT NULL,

    block_type TEXT NOT NULL DEFAULT 'text'
        CHECK (
            block_type IN (
                'heading',
                'text',
                'html',
                'faq',
                'list',
                'image',
                'cta',
                'json'
            )
        ),

    heading TEXT,
    content TEXT,

    content_json TEXT NOT NULL DEFAULT '{}',

    sort_order INTEGER NOT NULL DEFAULT 0,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (seo_entry_id) REFERENCES seo_entries(id) ON DELETE CASCADE,

    UNIQUE (seo_entry_id, block_key)
);


-- =========================================================
-- 60. SEO REDIRECTS
-- =========================================================

CREATE TABLE IF NOT EXISTS seo_redirects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    source_path TEXT NOT NULL UNIQUE,
    target_path TEXT NOT NULL,

    status_code INTEGER NOT NULL DEFAULT 301
        CHECK (status_code IN (301, 302, 307, 308)),

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    notes TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 61. SEO SETTINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS seo_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    setting_key TEXT NOT NULL UNIQUE,

    setting_value TEXT,

    setting_type TEXT NOT NULL DEFAULT 'string'
        CHECK (
            setting_type IN (
                'string',
                'number',
                'boolean',
                'json'
            )
        ),

    description TEXT,

    is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 62. LEGACY SEO PAGES
-- =========================================================
-- Kept so existing code continues working while seo_entries becomes
-- the primary CMS SEO source.

CREATE TABLE IF NOT EXISTS seo_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    page_type TEXT NOT NULL,

    entity_id INTEGER,

    path TEXT NOT NULL UNIQUE,

    seo_title TEXT,
    meta_description TEXT,

    canonical_url TEXT,

    og_title TEXT,
    og_description TEXT,
    og_image TEXT,

    robots TEXT NOT NULL DEFAULT 'index,follow',

    schema_json TEXT,

    is_indexable INTEGER NOT NULL DEFAULT 1 CHECK (is_indexable IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);



-- =========================================================
-- 63. FORM DEFINITIONS
-- =========================================================
-- Backend-managed forms. Every public business form can be versioned,
-- audited and mapped to a lead without hard-coding every field in the UI.

CREATE TABLE IF NOT EXISTS form_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    module TEXT NOT NULL,
    entity_type TEXT,

    version INTEGER NOT NULL DEFAULT 1,
    fields_json TEXT NOT NULL DEFAULT '[]',
    validation_json TEXT NOT NULL DEFAULT '{}',
    success_message TEXT,
    notification_emails_json TEXT NOT NULL DEFAULT '[]',

    capture_mode TEXT NOT NULL DEFAULT 'standard_form'
        CHECK (capture_mode IN ('standard_form', 'detail_gate', 'chatbot', 'other')),
    requires_phone_verification INTEGER NOT NULL DEFAULT 0 CHECK (requires_phone_verification IN (0, 1)),

    creates_lead INTEGER NOT NULL DEFAULT 1 CHECK (creates_lead IN (0, 1)),
    creates_booking INTEGER NOT NULL DEFAULT 0 CHECK (creates_booking IN (0, 1)),
    spam_protection_enabled INTEGER NOT NULL DEFAULT 1 CHECK (spam_protection_enabled IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 64. FORM SUBMISSIONS
-- =========================================================
-- Raw submission is retained so no field from a frontend form is lost.
-- Normalized lead data is copied into leads / request tables for reporting.

CREATE TABLE IF NOT EXISTS form_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    submission_number TEXT NOT NULL UNIQUE,

    form_id INTEGER,
    form_key TEXT NOT NULL,
    form_version INTEGER NOT NULL DEFAULT 1,

    lead_id INTEGER,
    capture_session_id INTEGER,
    user_id INTEGER,

    visitor_id INTEGER,
    session_id INTEGER,
    page_view_id INTEGER,

    entity_type TEXT,
    entity_id INTEGER,

    name TEXT,
    email TEXT,
    phone TEXT,
    whatsapp TEXT,

    country TEXT,
    state TEXT,
    district TEXT,
    city TEXT,
    pincode TEXT,

    page_path TEXT,
    landing_page TEXT,
    referrer_url TEXT,

    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    payload_json TEXT NOT NULL DEFAULT '{}',
    normalized_json TEXT NOT NULL DEFAULT '{}',

    ip_hash TEXT,
    user_agent TEXT,

    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'processed', 'spam', 'duplicate', 'archived')),

    spam_score REAL NOT NULL DEFAULT 0,
    duplicate_of_id INTEGER,

    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_id) REFERENCES form_definitions(id) ON DELETE SET NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (capture_session_id) REFERENCES lead_capture_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (page_view_id) REFERENCES web_page_views(id) ON DELETE SET NULL,
    FOREIGN KEY (duplicate_of_id) REFERENCES form_submissions(id) ON DELETE SET NULL
);


-- =========================================================
-- 65. PUJA SERVICE REQUESTS
-- =========================================================
-- Exact structured form data for services.ts / Puja Services.

CREATE TABLE IF NOT EXISTS puja_service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_submission_id INTEGER NOT NULL UNIQUE,
    lead_id INTEGER,

    puja_service_id INTEGER,
    requested_pandit_id INTEGER,
    temple_id INTEGER,

    service_mode TEXT NOT NULL DEFAULT 'home'
        CHECK (service_mode IN ('home', 'temple', 'online', 'travel', 'other')),

    requested_date TEXT,
    preferred_time TEXT,
    alternate_date TEXT,

    service_city TEXT,
    service_district TEXT,
    service_state TEXT,
    service_country TEXT DEFAULT 'India',
    service_address TEXT,
    service_pincode TEXT,

    language TEXT,
    gotra TEXT,
    family_names TEXT,
    devotee_count INTEGER CHECK (devotee_count IS NULL OR devotee_count >= 0),

    samagri_required INTEGER NOT NULL DEFAULT 1 CHECK (samagri_required IN (0, 1)),
    online_video_join INTEGER NOT NULL DEFAULT 0 CHECK (online_video_join IN (0, 1)),

    budget_amount INTEGER CHECK (budget_amount IS NULL OR budget_amount >= 0),
    special_requirements TEXT,
    message TEXT,

    details_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (puja_service_id) REFERENCES puja_services(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_pandit_id) REFERENCES pandit_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE SET NULL
);


-- =========================================================
-- 66. PANDIT BOOKING REQUESTS
-- =========================================================

CREATE TABLE IF NOT EXISTS pandit_booking_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_submission_id INTEGER NOT NULL UNIQUE,
    lead_id INTEGER,

    pandit_id INTEGER,
    pandit_service_id INTEGER,
    puja_service_id INTEGER,

    requested_date TEXT,
    preferred_time TEXT,
    duration_text TEXT,

    booking_mode TEXT NOT NULL DEFAULT 'home'
        CHECK (booking_mode IN ('home', 'temple', 'online', 'travel', 'other')),

    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',
    address TEXT,
    pincode TEXT,

    language TEXT,
    gotra TEXT,
    family_names TEXT,
    guest_count INTEGER CHECK (guest_count IS NULL OR guest_count >= 0),
    budget_amount INTEGER CHECK (budget_amount IS NULL OR budget_amount >= 0),

    special_requirements TEXT,
    message TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (pandit_id) REFERENCES pandit_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (pandit_service_id) REFERENCES pandit_service_offerings(id) ON DELETE SET NULL,
    FOREIGN KEY (puja_service_id) REFERENCES puja_services(id) ON DELETE SET NULL
);


-- =========================================================
-- 67. YATRA BOOKING REQUESTS
-- =========================================================
-- Exact structured travel form for yatra_packages / package enquiry.

CREATE TABLE IF NOT EXISTS yatra_booking_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_submission_id INTEGER NOT NULL UNIQUE,
    lead_id INTEGER,

    package_id INTEGER,

    departure_city TEXT,
    departure_state TEXT,
    departure_country TEXT DEFAULT 'India',

    travel_start_date TEXT,
    travel_end_date TEXT,

    adults INTEGER NOT NULL DEFAULT 1 CHECK (adults >= 0),
    children INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0),
    seniors INTEGER NOT NULL DEFAULT 0 CHECK (seniors >= 0),

    rooms_required INTEGER,
    preferred_transport TEXT,
    meal_preference TEXT,
    stay_preference TEXT,

    budget_amount INTEGER CHECK (budget_amount IS NULL OR budget_amount >= 0),

    medical_or_accessibility_requirements TEXT,
    special_requirements TEXT,
    message TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (package_id) REFERENCES yatra_packages(id) ON DELETE SET NULL
);


-- =========================================================
-- 68. TEMPLE ENQUIRY REQUESTS
-- =========================================================

CREATE TABLE IF NOT EXISTS temple_enquiry_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_submission_id INTEGER NOT NULL UNIQUE,
    lead_id INTEGER,
    temple_id INTEGER,

    enquiry_type TEXT,
    preferred_visit_date TEXT,
    preferred_time TEXT,
    devotees_count INTEGER CHECK (devotees_count IS NULL OR devotees_count >= 0),

    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',

    live_aarti_request INTEGER NOT NULL DEFAULT 0 CHECK (live_aarti_request IN (0, 1)),
    puja_request INTEGER NOT NULL DEFAULT 0 CHECK (puja_request IN (0, 1)),
    special_assistance TEXT,
    message TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (temple_id) REFERENCES temples(id) ON DELETE SET NULL
);


-- =========================================================
-- 69. ASHRAM ENQUIRY REQUESTS
-- =========================================================

CREATE TABLE IF NOT EXISTS ashram_enquiry_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_submission_id INTEGER NOT NULL UNIQUE,
    lead_id INTEGER,
    ashram_id INTEGER,

    visit_start_date TEXT,
    visit_end_date TEXT,
    adults INTEGER NOT NULL DEFAULT 1 CHECK (adults >= 0),
    children INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0),

    stay_required INTEGER NOT NULL DEFAULT 0 CHECK (stay_required IN (0, 1)),
    course_or_program TEXT,
    room_preference TEXT,
    food_preference TEXT,

    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',

    special_requirements TEXT,
    message TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (ashram_id) REFERENCES ashrams(id) ON DELETE SET NULL
);


-- =========================================================
-- 70. EVENT ENQUIRY REQUESTS
-- =========================================================

CREATE TABLE IF NOT EXISTS event_enquiry_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_submission_id INTEGER NOT NULL UNIQUE,
    lead_id INTEGER,
    event_id INTEGER,

    attending_date TEXT,
    attendee_count INTEGER CHECK (attendee_count IS NULL OR attendee_count >= 0),
    pass_type TEXT,
    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',

    message TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);


-- =========================================================
-- 71. COURSE ENQUIRY REQUESTS
-- =========================================================

CREATE TABLE IF NOT EXISTS course_enquiry_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_submission_id INTEGER NOT NULL UNIQUE,
    lead_id INTEGER,
    course_id INTEGER,

    preferred_start_date TEXT,
    batch_preference TEXT,
    learner_count INTEGER CHECK (learner_count IS NULL OR learner_count >= 0),
    mode TEXT CHECK (mode IS NULL OR mode IN ('online', 'offline', 'hybrid')),

    city TEXT,
    district TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',

    message TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
);


-- =========================================================
-- 72. GENERAL CONTACT REQUESTS
-- =========================================================

CREATE TABLE IF NOT EXISTS contact_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    form_submission_id INTEGER NOT NULL UNIQUE,
    lead_id INTEGER,

    subject TEXT,
    message TEXT NOT NULL,
    preferred_contact TEXT,

    details_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);


-- =========================================================
-- 73. LEAD NOTES
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    user_id INTEGER,

    note_type TEXT NOT NULL DEFAULT 'internal'
        CHECK (note_type IN ('internal', 'customer', 'system')),

    note TEXT NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 74. LEAD FOLLOW-UPS
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    assigned_to_user_id INTEGER,

    followup_type TEXT NOT NULL DEFAULT 'call'
        CHECK (followup_type IN ('call', 'whatsapp', 'email', 'meeting', 'reminder', 'other')),

    due_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),

    subject TEXT,
    notes TEXT,
    outcome TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 75. LEAD COMMUNICATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_communications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    user_id INTEGER,

    channel TEXT NOT NULL
        CHECK (channel IN ('phone', 'whatsapp', 'email', 'sms', 'system')),

    direction TEXT NOT NULL DEFAULT 'outbound'
        CHECK (direction IN ('inbound', 'outbound')),

    subject TEXT,
    message TEXT,
    provider_message_id TEXT,
    provider_status TEXT,

    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 76. LEAD TAGS
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_tag_map (
    lead_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (lead_id, tag_id),

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES lead_tags(id) ON DELETE CASCADE
);


-- =========================================================
-- 77. LEAD DOCUMENTS / ATTACHMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    uploaded_by_user_id INTEGER,

    document_type TEXT,
    original_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),

    is_private INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 78. LEAD CONSENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,

    consent_type TEXT NOT NULL
        CHECK (consent_type IN ('contact', 'whatsapp', 'marketing', 'terms', 'privacy')),

    granted INTEGER NOT NULL DEFAULT 0 CHECK (granted IN (0, 1)),
    consent_text TEXT,
    policy_version TEXT,
    source_ip_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);


-- =========================================================
-- 79. WEB VISITORS
-- =========================================================
-- Anonymous/known visitor identity. Store a generated visitor cookie ID;
-- IP is represented by a hash for attribution rather than permanent raw IP.

CREATE TABLE IF NOT EXISTS web_visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Generated, non-login visitor identity. This is the bridge that lets
    -- DivyaDhara record a visitor journey before registration/login.
    visitor_key TEXT NOT NULL UNIQUE,
    user_id INTEGER,

    visitor_type TEXT NOT NULL DEFAULT 'anonymous'
        CHECK (visitor_type IN ('anonymous', 'registered', 'pandit', 'temple_manager', 'ashram_manager', 'sales', 'super_admin', 'bot')),

    tracking_status TEXT NOT NULL DEFAULT 'active'
        CHECK (tracking_status IN ('active', 'opted_out', 'blocked', 'bot')),
    consent_source TEXT,
    consent_version TEXT,
    analytics_consent_at TEXT,

    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    first_page_path TEXT,
    last_page_path TEXT,

    first_referrer_url TEXT,
    last_referrer_url TEXT,

    first_utm_source TEXT,
    first_utm_medium TEXT,
    first_utm_campaign TEXT,
    first_utm_term TEXT,
    first_utm_content TEXT,

    country TEXT,
    state TEXT,
    district TEXT,
    city TEXT,

    language TEXT,
    timezone TEXT,

    device_type TEXT,
    browser TEXT,
    operating_system TEXT,

    ip_hash TEXT,
    is_bot INTEGER NOT NULL DEFAULT 0 CHECK (is_bot IN (0, 1)),

    total_sessions INTEGER NOT NULL DEFAULT 0 CHECK (total_sessions >= 0),
    total_page_views INTEGER NOT NULL DEFAULT 0 CHECK (total_page_views >= 0),
    total_events INTEGER NOT NULL DEFAULT 0 CHECK (total_events >= 0),

    marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
    analytics_consent INTEGER NOT NULL DEFAULT 1 CHECK (analytics_consent IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 80. WEB SESSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS web_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    session_key TEXT NOT NULL UNIQUE,
    visitor_id INTEGER NOT NULL,
    user_id INTEGER,

    -- Privacy-aware request context; store the IP hash, not the raw IP.
    ip_hash TEXT,
    request_id TEXT,

    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    entry_path TEXT,
    exit_path TEXT,
    landing_page TEXT,
    referrer_url TEXT,

    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    country TEXT,
    state TEXT,
    district TEXT,
    city TEXT,

    device_type TEXT,
    browser TEXT,
    operating_system TEXT,
    screen_width INTEGER,
    screen_height INTEGER,

    page_views INTEGER NOT NULL DEFAULT 0 CHECK (page_views >= 0),
    event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    engaged INTEGER NOT NULL DEFAULT 0 CHECK (engaged IN (0, 1)),
    is_bounce INTEGER NOT NULL DEFAULT 1 CHECK (is_bounce IN (0, 1)),
    is_bot INTEGER NOT NULL DEFAULT 0 CHECK (is_bot IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 81. WEB PAGE VIEWS
-- =========================================================
-- One row per page view. Supports exact per-page traffic, time-on-page,
-- source attribution, content entity and conversion attribution.

CREATE TABLE IF NOT EXISTS web_page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    visitor_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    user_id INTEGER,

    path TEXT NOT NULL,
    page_title TEXT,
    page_type TEXT,

    entity_type TEXT,
    entity_id INTEGER,

    country TEXT,
    state TEXT,
    district TEXT,
    city TEXT,

    referrer_url TEXT,
    previous_path TEXT,

    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    entered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    exited_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),

    scroll_depth_percent INTEGER NOT NULL DEFAULT 0 CHECK (scroll_depth_percent BETWEEN 0 AND 100),
    click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
    interaction_count INTEGER NOT NULL DEFAULT 0 CHECK (interaction_count >= 0),

    engaged INTEGER NOT NULL DEFAULT 0 CHECK (engaged IN (0, 1)),
    exit_page INTEGER NOT NULL DEFAULT 0 CHECK (exit_page IN (0, 1)),
    is_bounce_candidate INTEGER NOT NULL DEFAULT 0 CHECK (is_bounce_candidate IN (0, 1)),
    is_bot INTEGER NOT NULL DEFAULT 0 CHECK (is_bot IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 82. WEB EVENTS / MICRO INTERACTIONS
-- =========================================================
-- Clicks, CTA opens, WhatsApp clicks, phone clicks, form starts,
-- form submits, video plays, gallery opens, searches, scrolls, etc.

CREATE TABLE IF NOT EXISTS web_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    visitor_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    page_view_id INTEGER,
    user_id INTEGER,

    event_class TEXT NOT NULL DEFAULT 'analytics'
        CHECK (event_class IN ('essential', 'analytics', 'conversion', 'security')),
    event_source TEXT NOT NULL DEFAULT 'web'
        CHECK (event_source IN ('web', 'api', 'system', 'admin')),
    request_id TEXT,
    ip_hash TEXT,
    user_agent TEXT,

    event_name TEXT NOT NULL,
    event_category TEXT,
    target_type TEXT,
    target_key TEXT,
    target_label TEXT,

    path TEXT,
    entity_type TEXT,
    entity_id INTEGER,

    value_number REAL,
    value_text TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    country TEXT,
    state TEXT,
    district TEXT,
    city TEXT,

    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (page_view_id) REFERENCES web_page_views(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 83. WEB CONVERSIONS
-- =========================================================
-- Explicit business conversion attribution from a page/session/event to
-- a lead, booking, payment or signup.

CREATE TABLE IF NOT EXISTS web_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    visitor_id INTEGER,
    session_id INTEGER,
    page_view_id INTEGER,
    event_id INTEGER,

    conversion_type TEXT NOT NULL
        CHECK (conversion_type IN ('lead', 'booking', 'payment', 'signup', 'subscription', 'whatsapp', 'phone_call', 'email')),

    lead_id INTEGER,
    booking_id INTEGER,
    payment_id INTEGER,
    user_id INTEGER,

    value_amount INTEGER CHECK (value_amount IS NULL OR value_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',

    path TEXT,
    entity_type TEXT,
    entity_id INTEGER,

    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (page_view_id) REFERENCES web_page_views(id) ON DELETE SET NULL,
    FOREIGN KEY (event_id) REFERENCES web_events(id) ON DELETE SET NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 84. ANALYTICS DAILY PAGE STATS
-- =========================================================
-- Pre-aggregated business dashboard metrics; raw events remain available.

CREATE TABLE IF NOT EXISTS analytics_daily_page_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    stat_date TEXT NOT NULL,
    path TEXT NOT NULL,
    page_type TEXT,
    entity_type TEXT,
    entity_id INTEGER,

    country TEXT,
    state TEXT,
    district TEXT,
    city TEXT,

    page_views INTEGER NOT NULL DEFAULT 0,
    unique_visitors INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    engaged_sessions INTEGER NOT NULL DEFAULT 0,
    exits INTEGER NOT NULL DEFAULT 0,
    bounces INTEGER NOT NULL DEFAULT 0,

    total_duration_seconds INTEGER NOT NULL DEFAULT 0,
    avg_duration_seconds REAL NOT NULL DEFAULT 0,
    max_scroll_depth_percent REAL NOT NULL DEFAULT 0,

    clicks INTEGER NOT NULL DEFAULT 0,
    form_starts INTEGER NOT NULL DEFAULT 0,
    form_submissions INTEGER NOT NULL DEFAULT 0,
    whatsapp_clicks INTEGER NOT NULL DEFAULT 0,
    phone_clicks INTEGER NOT NULL DEFAULT 0,
    email_clicks INTEGER NOT NULL DEFAULT 0,
    video_plays INTEGER NOT NULL DEFAULT 0,
    gallery_opens INTEGER NOT NULL DEFAULT 0,

    leads INTEGER NOT NULL DEFAULT 0,
    bookings INTEGER NOT NULL DEFAULT 0,
    payments INTEGER NOT NULL DEFAULT 0,
    revenue_amount INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (stat_date, path, country, state, district, city)
);


-- =========================================================
-- 85. ANALYTICS DAILY SITE STATS
-- =========================================================

CREATE TABLE IF NOT EXISTS analytics_daily_site_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stat_date TEXT NOT NULL UNIQUE,

    visitors INTEGER NOT NULL DEFAULT 0,
    unique_logged_in_users INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    page_views INTEGER NOT NULL DEFAULT 0,
    engaged_sessions INTEGER NOT NULL DEFAULT 0,
    bounces INTEGER NOT NULL DEFAULT 0,

    leads INTEGER NOT NULL DEFAULT 0,
    bookings INTEGER NOT NULL DEFAULT 0,
    payments INTEGER NOT NULL DEFAULT 0,
    revenue_amount INTEGER NOT NULL DEFAULT 0,

    whatsapp_clicks INTEGER NOT NULL DEFAULT 0,
    phone_clicks INTEGER NOT NULL DEFAULT 0,
    email_clicks INTEGER NOT NULL DEFAULT 0,

    organic_sessions INTEGER NOT NULL DEFAULT 0,
    paid_sessions INTEGER NOT NULL DEFAULT 0,
    social_sessions INTEGER NOT NULL DEFAULT 0,
    referral_sessions INTEGER NOT NULL DEFAULT 0,
    direct_sessions INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 86. ANALYTICS GOALS
-- =========================================================

CREATE TABLE IF NOT EXISTS analytics_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    event_name TEXT NOT NULL,

    page_pattern TEXT,
    entity_type TEXT,
    entity_id INTEGER,

    goal_type TEXT NOT NULL DEFAULT 'conversion'
        CHECK (goal_type IN ('engagement', 'conversion', 'revenue')),

    value_amount INTEGER CHECK (value_amount IS NULL OR value_amount >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 87. SITE SEARCHES
-- =========================================================

CREATE TABLE IF NOT EXISTS site_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    visitor_id INTEGER,
    session_id INTEGER,
    user_id INTEGER,

    query_text TEXT NOT NULL,
    results_count INTEGER NOT NULL DEFAULT 0 CHECK (results_count >= 0),
    page_path TEXT,

    filter_json TEXT NOT NULL DEFAULT '{}',
    converted INTEGER NOT NULL DEFAULT 0 CHECK (converted IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 87.1 AI CONVERSATIONS
-- =========================================================
-- Phase 3 chatbot memory and role-aware guidance. No model/provider API
-- secrets are stored here.

CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    conversation_key TEXT NOT NULL UNIQUE,

    visitor_id INTEGER,
    session_id INTEGER,
    user_id INTEGER,
    lead_id INTEGER,

    role_context TEXT NOT NULL DEFAULT 'anonymous'
        CHECK (role_context IN ('anonymous', 'visitor', 'pandit', 'temple_manager', 'ashram_manager', 'sales', 'super_admin', 'other')),

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'waiting', 'closed', 'archived')),

    primary_intent TEXT,
    lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score >= 0),
    lead_temperature TEXT
        CHECK (lead_temperature IS NULL OR lead_temperature IN ('cold', 'warm', 'hot')),

    primary_entity_type TEXT,
    primary_entity_id INTEGER,

    summary TEXT,
    context_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}',

    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    retention_until TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);


-- =========================================================
-- 87.2 AI MESSAGES
-- =========================================================

CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    conversation_id INTEGER NOT NULL,
    sequence_no INTEGER NOT NULL,

    sender_type TEXT NOT NULL
        CHECK (sender_type IN ('user', 'assistant', 'system', 'tool')),

    content_type TEXT NOT NULL DEFAULT 'text'
        CHECK (content_type IN ('text', 'json', 'tool_call', 'tool_result')),

    message_text TEXT,
    content_json TEXT NOT NULL DEFAULT '{}',

    intent TEXT,
    tool_name TEXT,

    metadata_json TEXT NOT NULL DEFAULT '{}',
    token_input INTEGER CHECK (token_input IS NULL OR token_input >= 0),
    token_output INTEGER CHECK (token_output IS NULL OR token_output >= 0),

    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,

    UNIQUE (conversation_id, sequence_no)
);


-- =========================================================
-- 87.3 AI RECOMMENDATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS ai_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    conversation_id INTEGER,
    visitor_id INTEGER,
    session_id INTEGER,
    user_id INTEGER,

    role_context TEXT NOT NULL DEFAULT 'anonymous',
    recommendation_type TEXT NOT NULL,

    entity_type TEXT,
    entity_id INTEGER,

    title TEXT NOT NULL,
    summary TEXT,
    action_url TEXT,
    reason TEXT,
    confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

    status TEXT NOT NULL DEFAULT 'generated'
        CHECK (status IN ('generated', 'shown', 'clicked', 'dismissed', 'converted')),

    metadata_json TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (visitor_id) REFERENCES web_visitors(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES web_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- =========================================================
-- 88. SEO TEMPLATES
-- =========================================================
-- Supports programmatic deep SEO without inventing page content by hand.

CREATE TABLE IF NOT EXISTS seo_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    template_key TEXT NOT NULL UNIQUE,
    page_type TEXT NOT NULL,
    catalog_type TEXT,
    location_level TEXT,
    slug_pattern TEXT,
    canonical_pattern TEXT,
    min_listings_to_index INTEGER NOT NULL DEFAULT 1 CHECK (min_listings_to_index >= 0),

    title_template TEXT NOT NULL,
    meta_template TEXT,
    h1_template TEXT,
    intro_template TEXT,
    faq_template_json TEXT NOT NULL DEFAULT '[]',
    schema_template_json TEXT NOT NULL DEFAULT '{}',
    internal_links_template_json TEXT NOT NULL DEFAULT '[]',
    breadcrumb_template_json TEXT NOT NULL DEFAULT '[]',
    image_alt_template TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 89. SEO LOCATION PAGES
-- =========================================================
-- One scalable SEO target for country/state/district/city/area + service,
-- puja, travel, temple, pandit and other modules.

CREATE TABLE IF NOT EXISTS seo_location_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    seo_entry_id INTEGER,
    template_id INTEGER,

    location_id INTEGER NOT NULL,
    location_level TEXT NOT NULL
        CHECK (location_level IN ('country', 'state', 'district', 'city', 'area')),

    -- Catalogue being indexed on this geography.
    catalog_type TEXT NOT NULL DEFAULT 'other'
        CHECK (
            catalog_type IN (
                'temple',
                'pandit',
                'puja_service',
                'ashram',
                'yatra',
                'spiritual_place',
                'event',
                'course',
                'gallery',
                'video',
                'article',
                'other'
            )
        ),

    page_kind TEXT NOT NULL DEFAULT 'listing'
        CHECK (page_kind IN ('listing', 'entity', 'location_hub')),

    entity_type TEXT,
    entity_id INTEGER,

    page_key TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL UNIQUE,
    url_pattern TEXT,
    canonical_path TEXT,

    primary_keyword TEXT,
    keyword_cluster_json TEXT NOT NULL DEFAULT '[]',
    search_intent_json TEXT NOT NULL DEFAULT '[]',

    generated_title TEXT,
    generated_description TEXT,
    generated_h1 TEXT,
    generated_intro TEXT,
    generated_faq_json TEXT NOT NULL DEFAULT '[]',
    generated_schema_json TEXT NOT NULL DEFAULT '{}',
    generated_breadcrumb_json TEXT NOT NULL DEFAULT '[]',
    generated_body TEXT,

    listing_count INTEGER NOT NULL DEFAULT 0 CHECK (listing_count >= 0),
    minimum_listings_to_index INTEGER NOT NULL DEFAULT 3 CHECK (minimum_listings_to_index >= 0),
    noindex_reason TEXT,
    quality_score INTEGER CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
    content_hash TEXT,
    generation_version INTEGER NOT NULL DEFAULT 1,

    sitemap_priority REAL DEFAULT 0.6 CHECK (sitemap_priority BETWEEN 0 AND 1),
    sitemap_changefreq TEXT DEFAULT 'weekly',
    lastmod_at TEXT,
    published_at TEXT,

    is_indexable INTEGER NOT NULL DEFAULT 1 CHECK (is_indexable IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'unpublished')),

    priority INTEGER NOT NULL DEFAULT 0,
    last_generated_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (seo_entry_id) REFERENCES seo_entries(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES seo_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);


-- =========================================================
-- 90. SEO KEYWORDS
-- =========================================================

CREATE TABLE IF NOT EXISTS seo_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    keyword TEXT NOT NULL,
    keyword_normalized TEXT NOT NULL,
    cluster_key TEXT,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'generated', 'imported', 'search_console', 'analytics')),

    language TEXT NOT NULL DEFAULT 'en',
    intent TEXT,
    keyword_type TEXT NOT NULL DEFAULT 'secondary'
        CHECK (keyword_type IN ('primary', 'secondary', 'location', 'long_tail', 'question', 'brand')),

    country_id INTEGER,
    state_id INTEGER,
    district_id INTEGER,
    city_id INTEGER,
    area_id INTEGER,

    entity_type TEXT,
    entity_id INTEGER,
    seo_entry_id INTEGER,

    search_volume INTEGER,
    competition REAL,
    cpc REAL,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (keyword_normalized, language, entity_type, entity_id, country_id, state_id, district_id, city_id, area_id)
);


-- =========================================================
-- 91. SEO INTERNAL LINK TARGETS
-- =========================================================

CREATE TABLE IF NOT EXISTS seo_internal_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    from_seo_entry_id INTEGER NOT NULL,
    to_path TEXT NOT NULL,
    anchor_text TEXT NOT NULL,

    relevance_type TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (from_seo_entry_id) REFERENCES seo_entries(id) ON DELETE CASCADE
);


-- =========================================================
-- 91.1 SEO GENERATION RUNS
-- =========================================================
-- Tracks programmatic SEO generation/regeneration so an admin can see
-- what changed, why a page was made indexable/noindex, and which template
-- version produced the content.

CREATE TABLE IF NOT EXISTS seo_generation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    seo_location_page_id INTEGER,
    seo_entry_id INTEGER,

    run_type TEXT NOT NULL DEFAULT 'generate'
        CHECK (run_type IN ('generate', 'refresh', 'reindex', 'validate', 'manual')),

    template_id INTEGER,
    generation_version INTEGER NOT NULL DEFAULT 1,

    listing_count INTEGER NOT NULL DEFAULT 0 CHECK (listing_count >= 0),
    content_hash TEXT,

    result TEXT NOT NULL DEFAULT 'success'
        CHECK (result IN ('success', 'skipped', 'failed')),

    message TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,

    FOREIGN KEY (seo_location_page_id) REFERENCES seo_location_pages(id) ON DELETE CASCADE,
    FOREIGN KEY (seo_entry_id) REFERENCES seo_entries(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES seo_templates(id) ON DELETE SET NULL
);


-- =========================================================
-- 92. SEO CRAWL / INDEX HEALTH
-- =========================================================

CREATE TABLE IF NOT EXISTS seo_url_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    path TEXT NOT NULL UNIQUE,
    http_status INTEGER,
    canonical_url TEXT,
    robots TEXT,
    indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0, 1)),

    word_count INTEGER,
    response_time_ms INTEGER,
    title_length INTEGER,
    description_length INTEGER,

    last_crawled_at TEXT,
    last_index_check_at TEXT,
    last_error TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- LOCATION ANCESTRY MAINTENANCE
-- =========================================================
-- The *_id columns below are a cached representation of the hierarchy so
-- listing filters can use indexed equality checks instead of repeatedly
-- walking the tree. The canonical relationship remains locations.parent_id.
-- Admin/migration code should avoid changing the hierarchy casually because
-- SEO URLs and cached ancestry may need coordinated redirects/rebuilds.

CREATE TRIGGER IF NOT EXISTS trg_locations_set_ancestry_after_insert
AFTER INSERT ON locations
BEGIN
    UPDATE locations
    SET
        country_id = CASE
            WHEN NEW.type = 'country' THEN NEW.id
            WHEN NEW.parent_id IS NULL THEN NULL
            ELSE (SELECT CASE WHEN p.type = 'country' THEN p.id ELSE p.country_id END FROM locations p WHERE p.id = NEW.parent_id)
        END,
        state_id = CASE
            WHEN NEW.type = 'state' THEN NEW.id
            WHEN NEW.type IN ('district', 'city', 'area') AND NEW.parent_id IS NOT NULL
                THEN (SELECT CASE WHEN p.type = 'state' THEN p.id ELSE p.state_id END FROM locations p WHERE p.id = NEW.parent_id)
            ELSE NULL
        END,
        district_id = CASE
            WHEN NEW.type = 'district' THEN NEW.id
            WHEN NEW.type IN ('city', 'area') AND NEW.parent_id IS NOT NULL
                THEN (SELECT CASE WHEN p.type = 'district' THEN p.id ELSE p.district_id END FROM locations p WHERE p.id = NEW.parent_id)
            ELSE NULL
        END,
        city_id = CASE
            WHEN NEW.type = 'city' THEN NEW.id
            WHEN NEW.type = 'area' AND NEW.parent_id IS NOT NULL
                THEN (SELECT CASE WHEN p.type = 'city' THEN p.id ELSE p.city_id END FROM locations p WHERE p.id = NEW.parent_id)
            ELSE NULL
        END
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_locations_rebuild_ancestry_after_parent_change
AFTER UPDATE OF parent_id, type ON locations
BEGIN
    UPDATE locations
    SET
        country_id = CASE
            WHEN NEW.type = 'country' THEN NEW.id
            WHEN NEW.parent_id IS NULL THEN NULL
            ELSE (SELECT CASE WHEN p.type = 'country' THEN p.id ELSE p.country_id END FROM locations p WHERE p.id = NEW.parent_id)
        END,
        state_id = CASE
            WHEN NEW.type = 'state' THEN NEW.id
            WHEN NEW.type IN ('district', 'city', 'area') AND NEW.parent_id IS NOT NULL
                THEN (SELECT CASE WHEN p.type = 'state' THEN p.id ELSE p.state_id END FROM locations p WHERE p.id = NEW.parent_id)
            ELSE NULL
        END,
        district_id = CASE
            WHEN NEW.type = 'district' THEN NEW.id
            WHEN NEW.type IN ('city', 'area') AND NEW.parent_id IS NOT NULL
                THEN (SELECT CASE WHEN p.type = 'district' THEN p.id ELSE p.district_id END FROM locations p WHERE p.id = NEW.parent_id)
            ELSE NULL
        END,
        city_id = CASE
            WHEN NEW.type = 'city' THEN NEW.id
            WHEN NEW.type = 'area' AND NEW.parent_id IS NOT NULL
                THEN (SELECT CASE WHEN p.type = 'city' THEN p.id ELSE p.city_id END FROM locations p WHERE p.id = NEW.parent_id)
            ELSE NULL
        END
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_pandit_location_cache
AFTER INSERT ON pandit_profiles
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE pandit_profiles
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_pandit_location_cache_update
AFTER UPDATE OF location_id ON pandit_profiles
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE pandit_profiles
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_temple_location_cache
AFTER INSERT ON temples
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE temples
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_temple_location_cache_update
AFTER UPDATE OF location_id ON temples
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE temples
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ashram_location_cache
AFTER INSERT ON ashrams
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE ashrams
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ashram_location_cache_update
AFTER UPDATE OF location_id ON ashrams
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE ashrams
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;


-- =========================================================
-- EXTENDED CATALOGUE LOCATION CACHE TRIGGERS
-- =========================================================

CREATE TRIGGER IF NOT EXISTS trg_spiritual_places_location_cache
AFTER INSERT ON spiritual_places
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE spiritual_places
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_spiritual_places_location_cache_update
AFTER UPDATE OF location_id ON spiritual_places
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE spiritual_places
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_events_location_cache
AFTER INSERT ON events
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE events
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_events_location_cache_update
AFTER UPDATE OF location_id ON events
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE events
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_courses_location_cache
AFTER INSERT ON courses
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE courses
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_courses_location_cache_update
AFTER UPDATE OF location_id ON courses
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE courses
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_gallery_items_location_cache
AFTER INSERT ON gallery_items
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE gallery_items
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_videos_location_cache
AFTER INSERT ON videos
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE videos
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_videos_location_cache_update
AFTER UPDATE OF location_id ON videos
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE videos
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_articles_location_cache
AFTER INSERT ON articles
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE articles
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_articles_location_cache_update
AFTER UPDATE OF location_id ON articles
WHEN NEW.location_id IS NOT NULL
BEGIN
    UPDATE articles
    SET
        country_location_id = (SELECT country_id FROM locations WHERE id = NEW.location_id),
        state_location_id = (SELECT state_id FROM locations WHERE id = NEW.location_id),
        district_location_id = (SELECT district_id FROM locations WHERE id = NEW.location_id),
        city_location_id = (SELECT city_id FROM locations WHERE id = NEW.location_id)
    WHERE id = NEW.id;
END;


-- =========================================================
-- CATALOGUE LOCATION INDEX VIEWS
-- =========================================================
-- These views give backend listing/search routes one consistent place to
-- retrieve location ancestry for the four SEO-sensitive catalogues.

CREATE VIEW IF NOT EXISTS pandit_listing_location_index AS
SELECT
    p.id AS pandit_id,
    l.id AS location_id,
    l.type AS location_type,
    l.country_id,
    l.state_id,
    l.district_id,
    l.city_id,
    'primary' AS location_source
FROM pandit_profiles p
JOIN locations l ON l.id = p.location_id
WHERE p.location_id IS NOT NULL

UNION

SELECT
    psl.pandit_id,
    l.id AS location_id,
    l.type AS location_type,
    l.country_id,
    l.state_id,
    l.district_id,
    l.city_id,
    psl.relation_type AS location_source
FROM pandit_service_locations psl
JOIN locations l ON l.id = psl.location_id
WHERE psl.is_active = 1;

CREATE VIEW IF NOT EXISTS puja_service_listing_location_index AS
SELECT
    psl.puja_service_id,
    l.id AS location_id,
    l.type AS location_type,
    l.country_id,
    l.state_id,
    l.district_id,
    l.city_id,
    psl.availability_type AS location_source
FROM puja_service_locations psl
JOIN puja_services ps ON ps.id = psl.puja_service_id
JOIN locations l ON l.id = psl.location_id
WHERE psl.is_active = 1
  AND ps.status = 'published';


-- =========================================================
-- UNIFIED CATALOGUE LOCATION INDEX
-- =========================================================
-- Backend search can query one relation for country/state/district/city
-- filters across every catalogue while each module keeps its own table.

CREATE VIEW IF NOT EXISTS catalogue_location_index AS
SELECT 'temple' AS catalog_type, t.id AS entity_id, t.location_id, t.country_location_id, t.state_location_id, t.district_location_id, t.city_location_id, t.status AS catalog_status
FROM temples t

UNION ALL
SELECT 'pandit', p.id, p.location_id, p.country_location_id, p.state_location_id, p.district_location_id, p.city_location_id, p.profile_status
FROM pandit_profiles p
WHERE p.listing_active = 1

UNION ALL
SELECT 'puja_service', p.id, p.default_location_id, l.country_id, l.state_id, l.district_id, l.city_id, p.status
FROM puja_services p
LEFT JOIN locations l ON l.id = p.default_location_id

UNION ALL
SELECT 'ashram', a.id, a.location_id, a.country_location_id, a.state_location_id, a.district_location_id, a.city_location_id, a.status
FROM ashrams a

UNION ALL
SELECT 'yatra', y.id, y.location_id, y.country_location_id, y.state_location_id, y.district_location_id, y.city_location_id, y.status
FROM yatra_packages y

UNION ALL
SELECT 'spiritual_place', s.id, s.location_id, s.country_location_id, s.state_location_id, s.district_location_id, s.city_location_id, s.status
FROM spiritual_places s

UNION ALL
SELECT 'event', e.id, e.location_id, e.country_location_id, e.state_location_id, e.district_location_id, e.city_location_id, e.status
FROM events e

UNION ALL
SELECT 'gallery', g.id, g.location_id, g.country_location_id, g.state_location_id, g.district_location_id, g.city_location_id, g.status
FROM gallery_items g

UNION ALL
SELECT 'video', v.id, v.location_id, v.country_location_id, v.state_location_id, v.district_location_id, v.city_location_id, v.status
FROM videos v

UNION ALL
SELECT 'course', c.id, c.location_id, c.country_location_id, c.state_location_id, c.district_location_id, c.city_location_id, c.status
FROM courses c

UNION ALL
SELECT 'article', a.id, a.location_id, a.country_location_id, a.state_location_id, a.district_location_id, a.city_location_id, a.status
FROM articles a;


-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_state_code ON locations(state_code);

CREATE INDEX IF NOT EXISTS idx_pandits_profile_status ON pandit_profiles(profile_status);
CREATE INDEX IF NOT EXISTS idx_pandits_verification_status ON pandit_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_pandits_listing_active ON pandit_profiles(listing_active);
CREATE INDEX IF NOT EXISTS idx_pandits_featured ON pandit_profiles(featured);
CREATE INDEX IF NOT EXISTS idx_pandits_location_id ON pandit_profiles(location_id);
CREATE INDEX IF NOT EXISTS idx_pandits_city ON pandit_profiles(city);
CREATE INDEX IF NOT EXISTS idx_pandits_state ON pandit_profiles(state);

CREATE INDEX IF NOT EXISTS idx_pandit_services_pandit ON pandit_service_offerings(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_services_active ON pandit_service_offerings(is_active);

CREATE INDEX IF NOT EXISTS idx_temples_status ON temples(status);
CREATE INDEX IF NOT EXISTS idx_temples_featured ON temples(featured);
CREATE INDEX IF NOT EXISTS idx_temples_location_id ON temples(location_id);
CREATE INDEX IF NOT EXISTS idx_temples_city ON temples(city);
CREATE INDEX IF NOT EXISTS idx_temples_state ON temples(state);

CREATE INDEX IF NOT EXISTS idx_temple_schedules_temple ON temple_schedules(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_schedules_type ON temple_schedules(schedule_type);
CREATE INDEX IF NOT EXISTS idx_temple_schedules_active ON temple_schedules(is_active);


CREATE INDEX IF NOT EXISTS idx_temple_category_map_category ON temple_category_map(category_id);
CREATE INDEX IF NOT EXISTS idx_temple_history_temple ON temple_history(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_significance_temple ON temple_significance(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_divine_attractions_temple ON temple_divine_attractions(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_scriptural_connections_temple ON temple_scriptural_connections(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_pilgrim_experience_temple ON temple_pilgrim_experience(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_bhagavata_connections_temple ON temple_bhagavata_connections(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_darshan_timings_temple ON temple_darshan_timings(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_darshan_timings_active ON temple_darshan_timings(is_active);
CREATE INDEX IF NOT EXISTS idx_temple_aarti_temple ON temple_aarti(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_aarti_active ON temple_aarti(is_active);
CREATE INDEX IF NOT EXISTS idx_temple_festivals_temple ON temple_festivals(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_festivals_year ON temple_festivals(year);
CREATE INDEX IF NOT EXISTS idx_temple_facilities_temple ON temple_facilities(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_how_to_reach_temple ON temple_how_to_reach(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_committee_temple ON temple_committee(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_faqs_temple ON temple_faqs(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_nearby_places_temple ON temple_nearby_places(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_nearby_places_location ON temple_nearby_places(location_id);
CREATE INDEX IF NOT EXISTS idx_temple_sources_temple ON temple_sources(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_sources_type ON temple_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_temple_live_aarti_enabled ON temple_live_aarti(enabled);
CREATE INDEX IF NOT EXISTS idx_temple_seo_keywords_temple ON temple_seo_keywords(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_seo_keywords_type ON temple_seo_keywords(keyword_type);

CREATE INDEX IF NOT EXISTS idx_puja_services_status ON puja_services(status);
CREATE INDEX IF NOT EXISTS idx_puja_services_featured ON puja_services(featured);
CREATE INDEX IF NOT EXISTS idx_puja_services_sort ON puja_services(sort_order);

CREATE INDEX IF NOT EXISTS idx_ashrams_status ON ashrams(status);
CREATE INDEX IF NOT EXISTS idx_ashrams_featured ON ashrams(featured);
CREATE INDEX IF NOT EXISTS idx_ashrams_listing_active ON ashrams(listing_active);
CREATE INDEX IF NOT EXISTS idx_ashrams_location_id ON ashrams(location_id);
CREATE INDEX IF NOT EXISTS idx_ashrams_city ON ashrams(city);
CREATE INDEX IF NOT EXISTS idx_ashrams_state ON ashrams(state);

CREATE INDEX IF NOT EXISTS idx_ashram_programs_ashram ON ashram_programs(ashram_id);
CREATE INDEX IF NOT EXISTS idx_ashram_programs_active ON ashram_programs(is_active);

CREATE INDEX IF NOT EXISTS idx_yatra_packages_status ON yatra_packages(status);
CREATE INDEX IF NOT EXISTS idx_yatra_packages_featured ON yatra_packages(featured);
CREATE INDEX IF NOT EXISTS idx_yatra_packages_sort ON yatra_packages(sort_order);

CREATE INDEX IF NOT EXISTS idx_package_locations_package ON yatra_package_locations(package_id);
CREATE INDEX IF NOT EXISTS idx_package_locations_location ON yatra_package_locations(location_id);

CREATE INDEX IF NOT EXISTS idx_package_itineraries_package ON package_itineraries(package_id);
CREATE INDEX IF NOT EXISTS idx_package_itineraries_location ON package_itineraries(location_id);

CREATE INDEX IF NOT EXISTS idx_spiritual_places_status ON spiritual_places(status);
CREATE INDEX IF NOT EXISTS idx_spiritual_places_featured ON spiritual_places(featured);
CREATE INDEX IF NOT EXISTS idx_spiritual_places_location_id ON spiritual_places(location_id);
CREATE INDEX IF NOT EXISTS idx_spiritual_places_city ON spiritual_places(city);
CREATE INDEX IF NOT EXISTS idx_spiritual_places_state ON spiritual_places(state);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_featured ON events(featured);
CREATE INDEX IF NOT EXISTS idx_events_location_id ON events(location_id);
CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
CREATE INDEX IF NOT EXISTS idx_events_state ON events(state);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);

CREATE INDEX IF NOT EXISTS idx_event_schedules_event ON event_schedules(event_id);
CREATE INDEX IF NOT EXISTS idx_event_schedules_date ON event_schedules(schedule_date);

CREATE INDEX IF NOT EXISTS idx_gallery_items_status ON gallery_items(status);
CREATE INDEX IF NOT EXISTS idx_gallery_items_featured ON gallery_items(featured);
CREATE INDEX IF NOT EXISTS idx_gallery_items_location ON gallery_items(location_id);
CREATE INDEX IF NOT EXISTS idx_gallery_media_item ON gallery_media(gallery_item_id);

CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_featured ON videos(featured);
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at);
CREATE INDEX IF NOT EXISTS idx_videos_location ON videos(location_id);

CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_featured ON courses(featured);
CREATE INDEX IF NOT EXISTS idx_courses_location ON courses(location_id);

CREATE INDEX IF NOT EXISTS idx_course_lessons_course ON course_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(featured);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_location ON articles(location_id);

CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status);
CREATE INDEX IF NOT EXISTS idx_live_streams_temple ON live_streams(related_temple_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_audience ON subscription_plans(audience);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_sort ON subscription_plans(audience, sort_order);

CREATE INDEX IF NOT EXISTS idx_pandit_subscriptions_pandit ON pandit_subscriptions(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_subscriptions_plan ON pandit_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_pandit_subscriptions_status ON pandit_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_pandit_subscriptions_expiry ON pandit_subscriptions(expires_at);

CREATE INDEX IF NOT EXISTS idx_temple_subscriptions_temple ON temple_subscriptions(temple_id);
CREATE INDEX IF NOT EXISTS idx_temple_subscriptions_manager ON temple_subscriptions(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_temple_subscriptions_plan ON temple_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_temple_subscriptions_status ON temple_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_temple_subscriptions_expiry ON temple_subscriptions(expires_at);

CREATE INDEX IF NOT EXISTS idx_ashram_subscriptions_ashram ON ashram_subscriptions(ashram_id);
CREATE INDEX IF NOT EXISTS idx_ashram_subscriptions_manager ON ashram_subscriptions(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_ashram_subscriptions_plan ON ashram_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_ashram_subscriptions_status ON ashram_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_ashram_subscriptions_expiry ON ashram_subscriptions(expires_at);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_temple ON leads(temple_id);
CREATE INDEX IF NOT EXISTS idx_leads_pandit ON leads(requested_pandit_id);
CREATE INDEX IF NOT EXISTS idx_leads_ashram ON leads(ashram_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead ON lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_pandit ON lead_assignments(pandit_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_subscription ON lead_assignments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_status ON lead_assignments(status);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_type ON lead_assignments(assignment_type, status);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_assignment ON lead_events(assignment_id);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_pandit ON bookings(pandit_id);
CREATE INDEX IF NOT EXISTS idx_bookings_temple ON bookings(temple_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ashram ON bookings(ashram_id);
CREATE INDEX IF NOT EXISTS idx_bookings_puja ON bookings(puja_id);
CREATE INDEX IF NOT EXISTS idx_bookings_package ON bookings(package_id);
CREATE INDEX IF NOT EXISTS idx_bookings_course ON bookings(course_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_plan ON payment_orders(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_order ON payment_orders(provider_order_id);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_pandit ON payments(pandit_id);
CREATE INDEX IF NOT EXISTS idx_payments_temple ON payments(temple_id);
CREATE INDEX IF NOT EXISTS idx_payments_ashram ON payments(ashram_id);
CREATE INDEX IF NOT EXISTS idx_payments_plan ON payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_order ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment ON payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_links_user ON payment_links(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_links_provider_id ON payment_links(provider_link_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON payment_webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON payment_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON payment_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON payment_webhook_events(received_at);

CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON subscription_events(subscription_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_id ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created ON subscription_events(created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_sales_user ON sales_activities(sales_user_id);
CREATE INDEX IF NOT EXISTS idx_sales_lead ON sales_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_pandit ON sales_activities(pandit_id);
CREATE INDEX IF NOT EXISTS idx_sales_temple ON sales_activities(temple_id);
CREATE INDEX IF NOT EXISTS idx_sales_ashram ON sales_activities(ashram_id);
CREATE INDEX IF NOT EXISTS idx_sales_followup ON sales_activities(next_follow_up_at);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_visitor ON audit_logs(visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_type ON audit_logs(actor_type, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_seo_entries_page_type ON seo_entries(page_type);
CREATE INDEX IF NOT EXISTS idx_seo_entries_entity ON seo_entries(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_seo_entries_country ON seo_entries(country_id);
CREATE INDEX IF NOT EXISTS idx_seo_entries_state ON seo_entries(state_id);
CREATE INDEX IF NOT EXISTS idx_seo_entries_city ON seo_entries(city_id);
CREATE INDEX IF NOT EXISTS idx_seo_entries_indexable ON seo_entries(is_indexable);
CREATE INDEX IF NOT EXISTS idx_seo_entries_status ON seo_entries(status);

CREATE INDEX IF NOT EXISTS idx_seo_blocks_entry ON seo_content_blocks(seo_entry_id);
CREATE INDEX IF NOT EXISTS idx_seo_blocks_sort ON seo_content_blocks(seo_entry_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_seo_redirects_active ON seo_redirects(is_active);
CREATE INDEX IF NOT EXISTS idx_seo_redirects_status ON seo_redirects(status_code);

CREATE INDEX IF NOT EXISTS idx_seo_pages_page_type ON seo_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_seo_pages_entity ON seo_pages(entity_id);


CREATE INDEX IF NOT EXISTS idx_locations_district_parent ON locations(type, parent_id);
CREATE INDEX IF NOT EXISTS idx_seo_entries_district ON seo_entries(district_id);
CREATE INDEX IF NOT EXISTS idx_seo_entries_area ON seo_entries(area_id);
CREATE INDEX IF NOT EXISTS idx_seo_entries_location_level ON seo_entries(location_level);

CREATE INDEX IF NOT EXISTS idx_leads_service ON leads(puja_service_id);
CREATE INDEX IF NOT EXISTS idx_leads_package ON leads(yatra_package_id);
CREATE INDEX IF NOT EXISTS idx_leads_event ON leads(event_id);
CREATE INDEX IF NOT EXISTS idx_leads_course ON leads(course_id);
CREATE INDEX IF NOT EXISTS idx_leads_place ON leads(spiritual_place_id);
CREATE INDEX IF NOT EXISTS idx_leads_district ON leads(district);
CREATE INDEX IF NOT EXISTS idx_leads_status_priority ON leads(status, priority);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source_type, source_page);
CREATE INDEX IF NOT EXISTS idx_leads_utm ON leads(utm_source, utm_medium, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_visitor ON leads(visitor_id);
CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_temperature, lead_score);
CREATE INDEX IF NOT EXISTS idx_leads_activity ON leads(last_activity_at);

CREATE INDEX IF NOT EXISTS idx_form_definitions_module ON form_definitions(module);
CREATE INDEX IF NOT EXISTS idx_form_definitions_active ON form_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_key, submitted_at);
CREATE INDEX IF NOT EXISTS idx_form_submissions_lead ON form_submissions(lead_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_capture_session ON form_submissions(capture_session_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user ON form_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_visitor ON form_submissions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_entity ON form_submissions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_location ON form_submissions(country, state, district, city);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);

CREATE INDEX IF NOT EXISTS idx_puja_requests_service ON puja_service_requests(puja_service_id);
CREATE INDEX IF NOT EXISTS idx_puja_requests_date ON puja_service_requests(requested_date);
CREATE INDEX IF NOT EXISTS idx_puja_requests_location ON puja_service_requests(service_country, service_state, service_district, service_city);
CREATE INDEX IF NOT EXISTS idx_pandit_requests_pandit ON pandit_booking_requests(pandit_id);
CREATE INDEX IF NOT EXISTS idx_yatra_requests_package ON yatra_booking_requests(package_id);
CREATE INDEX IF NOT EXISTS idx_yatra_requests_dates ON yatra_booking_requests(travel_start_date, travel_end_date);
CREATE INDEX IF NOT EXISTS idx_temple_requests_temple ON temple_enquiry_requests(temple_id);
CREATE INDEX IF NOT EXISTS idx_ashram_requests_ashram ON ashram_enquiry_requests(ashram_id);
CREATE INDEX IF NOT EXISTS idx_event_requests_event ON event_enquiry_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_course_requests_course ON course_enquiry_requests(course_id);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_followups_due ON lead_followups(status, due_at);
CREATE INDEX IF NOT EXISTS idx_lead_followups_user ON lead_followups(assigned_to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_communications_lead ON lead_communications(lead_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_lead_communications_channel ON lead_communications(channel, occurred_at);
CREATE INDEX IF NOT EXISTS idx_lead_tag_map_tag ON lead_tag_map(tag_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_lead ON lead_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_consents_lead ON lead_consents(lead_id, consent_type);

CREATE INDEX IF NOT EXISTS idx_web_visitors_type ON web_visitors(visitor_type);
CREATE INDEX IF NOT EXISTS idx_web_visitors_last_seen ON web_visitors(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_web_visitors_location ON web_visitors(country, state, district, city);
CREATE INDEX IF NOT EXISTS idx_web_visitors_user ON web_visitors(user_id);
CREATE INDEX IF NOT EXISTS idx_web_sessions_visitor ON web_sessions(visitor_id, started_at);
CREATE INDEX IF NOT EXISTS idx_web_sessions_started ON web_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_web_sessions_landing ON web_sessions(landing_page);
CREATE INDEX IF NOT EXISTS idx_web_sessions_utm ON web_sessions(utm_source, utm_medium, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_web_sessions_geo ON web_sessions(country, state, district, city);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON web_page_views(path, entered_at);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON web_page_views(visitor_id, entered_at);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON web_page_views(session_id, entered_at);
CREATE INDEX IF NOT EXISTS idx_page_views_entity ON web_page_views(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_page_views_geo ON web_page_views(country, state, district, city);
CREATE INDEX IF NOT EXISTS idx_page_views_utm ON web_page_views(utm_source, utm_medium, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_web_events_name ON web_events(event_name, occurred_at);
CREATE INDEX IF NOT EXISTS idx_web_visitors_tracking_status
    ON web_visitors(tracking_status, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_web_sessions_request_id
    ON web_sessions(request_id);
CREATE INDEX IF NOT EXISTS idx_web_events_request_id
    ON web_events(request_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_web_events_actor_context
    ON web_events(visitor_id, user_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_web_events_path ON web_events(path, event_name);
CREATE INDEX IF NOT EXISTS idx_web_events_page_view ON web_events(page_view_id);
CREATE INDEX IF NOT EXISTS idx_web_events_entity ON web_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_web_conversions_type ON web_conversions(conversion_type, created_at);
CREATE INDEX IF NOT EXISTS idx_web_conversions_lead ON web_conversions(lead_id);
CREATE INDEX IF NOT EXISTS idx_web_conversions_booking ON web_conversions(booking_id);
CREATE INDEX IF NOT EXISTS idx_web_conversions_payment ON web_conversions(payment_id);
CREATE INDEX IF NOT EXISTS idx_web_conversions_utm ON web_conversions(utm_source, utm_medium, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_analytics_page_date ON analytics_daily_page_stats(stat_date, path);
CREATE INDEX IF NOT EXISTS idx_analytics_page_geo ON analytics_daily_page_stats(stat_date, country, state, district, city);
CREATE INDEX IF NOT EXISTS idx_site_stats_date ON analytics_daily_site_stats(stat_date);
CREATE INDEX IF NOT EXISTS idx_goals_active ON analytics_goals(is_active, event_name);
CREATE INDEX IF NOT EXISTS idx_site_search_query ON site_searches(query_text, created_at);
CREATE INDEX IF NOT EXISTS idx_site_search_session ON site_searches(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_lead_capture_sessions_visitor ON lead_capture_sessions(visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_capture_sessions_session ON lead_capture_sessions(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_capture_sessions_entity ON lead_capture_sessions(module, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_lead_capture_sessions_status ON lead_capture_sessions(status, verification_status, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_capture_sessions_lead ON lead_capture_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_capture_signals_lead ON lead_capture_signals(lead_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_lead_capture_signals_capture ON lead_capture_signals(capture_session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_lead_capture_signals_ai ON lead_capture_signals(ai_conversation_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_lead_capture_signals_entity ON lead_capture_signals(entity_type, entity_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_visitor ON ai_conversations(visitor_id, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_lead ON ai_conversations(lead_id, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_status ON ai_conversations(status, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_conversation ON ai_recommendations(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_entity ON ai_recommendations(entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_seo_location_page_location ON seo_location_pages(location_id, location_level);
CREATE INDEX IF NOT EXISTS idx_seo_location_page_entity ON seo_location_pages(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_seo_location_page_status ON seo_location_pages(status, is_indexable);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_location ON seo_keywords(country_id, state_id, district_id, city_id, area_id);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_entity ON seo_keywords(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_intent ON seo_keywords(intent, keyword_type);
CREATE INDEX IF NOT EXISTS idx_seo_internal_links_from ON seo_internal_links(from_seo_entry_id);
CREATE INDEX IF NOT EXISTS idx_seo_internal_links_to ON seo_internal_links(to_path);
CREATE INDEX IF NOT EXISTS idx_seo_health_status ON seo_url_health(http_status, indexable);

-- =========================================================
-- SEO LISTING CONTROLS
-- =========================================================
-- Defines which geographic levels are eligible for indexable catalogue
-- landing pages and which common faceted filters must stay out of the
-- crawlable URL space.

CREATE TABLE IF NOT EXISTS seo_listing_controls (
    catalog_type TEXT PRIMARY KEY
        CHECK (catalog_type IN ('temple', 'pandit', 'puja_service', 'ashram')),

    base_path TEXT NOT NULL,
    detail_path_template TEXT NOT NULL,

    indexable_location_levels_json TEXT NOT NULL DEFAULT '["country","state","district","city"]',

    min_country_listings INTEGER NOT NULL DEFAULT 3 CHECK (min_country_listings >= 0),
    min_state_listings INTEGER NOT NULL DEFAULT 3 CHECK (min_state_listings >= 0),
    min_district_listings INTEGER NOT NULL DEFAULT 3 CHECK (min_district_listings >= 0),
    min_city_listings INTEGER NOT NULL DEFAULT 3 CHECK (min_city_listings >= 0),

    noindex_query_parameters_json TEXT NOT NULL DEFAULT '[]',
    canonical_query_strategy TEXT NOT NULL DEFAULT 'location_path'
        CHECK (canonical_query_strategy IN ('location_path', 'self', 'custom')),

    sitemap_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sitemap_enabled IN (0, 1)),
    internal_linking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (internal_linking_enabled IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- LOCATION / CATALOGUE / SEO INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_locations_hierarchy
    ON locations(type, parent_id, status);

CREATE INDEX IF NOT EXISTS idx_locations_country_id
    ON locations(country_id, type, status);

CREATE INDEX IF NOT EXISTS idx_locations_state_id
    ON locations(state_id, type, status);

CREATE INDEX IF NOT EXISTS idx_locations_district_id
    ON locations(district_id, type, status);

CREATE INDEX IF NOT EXISTS idx_locations_city_id
    ON locations(city_id, type, status);

CREATE INDEX IF NOT EXISTS idx_locations_normalized_name
    ON locations(normalized_name, type, status);

CREATE INDEX IF NOT EXISTS idx_location_aliases_search
    ON location_aliases(normalized_alias, language, is_active);

CREATE INDEX IF NOT EXISTS idx_location_aliases_location
    ON location_aliases(location_id, is_active, is_primary);

CREATE INDEX IF NOT EXISTS idx_pandits_geo_filter
    ON pandit_profiles(country_location_id, state_location_id, district_location_id, city_location_id, listing_active, profile_status);

CREATE INDEX IF NOT EXISTS idx_pandit_service_locations_geo
    ON pandit_service_locations(location_id, is_active, pandit_id);

CREATE INDEX IF NOT EXISTS idx_pandit_service_locations_pandit
    ON pandit_service_locations(pandit_id, is_active, priority);

CREATE INDEX IF NOT EXISTS idx_temples_geo_filter
    ON temples(country_location_id, state_location_id, district_location_id, city_location_id, status, featured);

CREATE INDEX IF NOT EXISTS idx_ashrams_geo_filter
    ON ashrams(country_location_id, state_location_id, district_location_id, city_location_id, status, listing_active);

CREATE INDEX IF NOT EXISTS idx_puja_services_location_scope
    ON puja_services(availability_scope, status, featured);

CREATE INDEX IF NOT EXISTS idx_puja_service_locations_geo
    ON puja_service_locations(location_id, is_active, puja_service_id);

CREATE INDEX IF NOT EXISTS idx_puja_service_locations_service
    ON puja_service_locations(puja_service_id, is_active, priority);

CREATE INDEX IF NOT EXISTS idx_seo_entries_deep_location
    ON seo_entries(country_id, state_id, district_id, city_id, page_type, status, is_indexable);

CREATE INDEX IF NOT EXISTS idx_seo_entries_path_indexable
    ON seo_entries(path, is_indexable, status);

CREATE INDEX IF NOT EXISTS idx_seo_location_pages_catalog
    ON seo_location_pages(catalog_type, location_id, location_level, page_kind, status, is_indexable);

CREATE INDEX IF NOT EXISTS idx_seo_location_pages_entity_location
    ON seo_location_pages(entity_type, entity_id, location_id, page_kind);

CREATE INDEX IF NOT EXISTS idx_seo_location_pages_canonical
    ON seo_location_pages(canonical_path);

CREATE INDEX IF NOT EXISTS idx_seo_generation_page
    ON seo_generation_runs(seo_location_page_id, started_at);

CREATE INDEX IF NOT EXISTS idx_seo_generation_result
    ON seo_generation_runs(result, started_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_location_listing_unique
    ON seo_location_pages(catalog_type, location_id, location_level, page_kind, COALESCE(entity_id, 0));

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_unique
    ON payments(provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_razorpay_unique
    ON subscription_plans(razorpay_plan_id)
    WHERE razorpay_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pandit_subscriptions_payment
    ON pandit_subscriptions(payment_id, payment_order_id);

CREATE INDEX IF NOT EXISTS idx_temple_subscriptions_payment
    ON temple_subscriptions(payment_id, payment_order_id);

CREATE INDEX IF NOT EXISTS idx_ashram_manager_profiles_user ON ashram_manager_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_ashram_manager_profiles_status ON ashram_manager_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_ashram_manager_assignments_ashram ON ashram_manager_assignments(ashram_id, status);
CREATE INDEX IF NOT EXISTS idx_ashram_manager_assignments_manager ON ashram_manager_assignments(manager_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ashram_manager_assignments_assigned_by ON ashram_manager_assignments(assigned_by, assigned_at);

CREATE INDEX IF NOT EXISTS idx_ashram_subscriptions_payment
    ON ashram_subscriptions(payment_id, payment_order_id);

CREATE INDEX IF NOT EXISTS idx_subscription_events_payment
    ON subscription_events(payment_id, payment_order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_subscription_sources
    ON lead_assignments(pandit_subscription_id, temple_subscription_id, ashram_subscription_id, lead_credit_used);


-- =========================================================
-- SEED ROLES
-- =========================================================
-- Visitor is also a registered account role; anonymous visitors are NOT users.
-- Anonymous visitors live in web_visitors and can later be linked to users.

INSERT INTO roles
(code, name, description, public_registration_enabled, approval_required, dashboard_path, is_system, is_active)
VALUES
('visitor', 'Visitor', 'Regular DivyaDhara visitor/devotee account', 1, 0, '/dashboard', 1, 1),
('pandit', 'Pandit', 'Pandit/acharya account for listings and lead management', 1, 1, '/pandit/dashboard', 1, 1),
('temple_manager', 'Temple Manager', 'Temple representative/manager account', 1, 1, '/temple/dashboard', 1, 1),
('ashram_manager', 'Ashram Manager', 'Ashram representative/manager account', 1, 1, '/ashram/dashboard', 1, 1),
('sales', 'Sales', 'Sales and onboarding team account; no public self-registration', 0, 0, '/sales/dashboard', 1, 1),
('super_admin', 'Super Admin', 'Full system administration account; no public self-registration', 0, 0, '/admin', 1, 1)
ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    public_registration_enabled = excluded.public_registration_enabled,
    approval_required = excluded.approval_required,
    dashboard_path = excluded.dashboard_path,
    is_system = excluded.is_system,
    is_active = excluded.is_active,
    updated_at = CURRENT_TIMESTAMP;


-- =========================================================
-- SEED PERMISSIONS
-- =========================================================

INSERT OR IGNORE INTO permissions (code, name, description, module)
VALUES
('auth.view_profile', 'View Own Profile', 'View own account profile', 'auth'),
('auth.edit_profile', 'Edit Own Profile', 'Edit own account profile', 'auth'),

('pandit.view_listing', 'View Pandit Listing', 'View public Pandit listings', 'pandit'),
('pandit.manage_own_profile', 'Manage Own Pandit Profile', 'Manage own Pandit profile', 'pandit'),
('pandit.view_own_leads', 'View Own Leads', 'View leads assigned to own Pandit profile', 'pandit'),
('pandit.update_own_leads', 'Update Own Leads', 'Update own lead status and notes', 'pandit'),
('pandit.manage_subscription', 'Manage Own Subscription', 'View and purchase Pandit subscription', 'pandit'),

('temple.view', 'View Temples', 'View temple information', 'temple'),
('temple.manage_assigned', 'Manage Assigned Temples', 'Edit assigned temple information', 'temple'),
('temple.view_leads', 'View Temple Leads', 'View leads related to assigned temples', 'temple'),
('temple.manage_subscription', 'Manage Temple Subscription', 'View and purchase temple subscription', 'temple'),

('ashram.view', 'View Ashrams', 'View Ashram information', 'ashram'),
('ashram.manage_assigned', 'Manage Assigned Ashrams', 'Edit assigned Ashram information', 'ashram'),
('ashram.view_leads', 'View Ashram Leads', 'View leads related to assigned Ashrams', 'ashram'),
('ashram.manage_programs', 'Manage Ashram Programs', 'Manage programs associated with assigned Ashrams', 'ashram'),
('ashram.manage_subscription', 'Manage Ashram Subscription', 'View and purchase Ashram subscription', 'ashram'),

('sales.view_leads', 'View Sales Leads', 'View assigned sales leads', 'sales'),
('sales.manage_leads', 'Manage Sales Leads', 'Manage sales lead pipeline', 'sales'),
('sales.view_pandits', 'View Pandits', 'View Pandit onboarding information', 'sales'),
('sales.manage_followups', 'Manage Follow Ups', 'Manage sales follow-up activities', 'sales'),
('sales.view_ashrams', 'View Ashrams', 'View Ashram onboarding information', 'sales'),
('sales.manage_ashram_subscriptions', 'Manage Ashram Subscriptions', 'Assist with Ashram plan onboarding and subscription management', 'sales'),
('sales.view_subscriptions', 'View Subscriptions', 'View commercial subscription status for assigned accounts', 'sales'),

('admin.view_dashboard', 'View Admin Dashboard', 'View administration dashboard', 'admin'),
('admin.manage_users', 'Manage Users', 'Create/update/suspend users', 'admin'),
('admin.manage_pandits', 'Manage Pandits', 'Approve and manage Pandit profiles', 'admin'),
('admin.verify_pandits', 'Verify Pandits', 'Review and verify Pandit documents', 'admin'),
('admin.manage_temples', 'Manage Temples', 'Create and manage temples', 'admin'),
('admin.manage_temple_managers', 'Manage Temple Managers', 'Assign Temple Managers', 'admin'),
('admin.manage_ashram_managers', 'Manage Ashram Managers', 'Assign and manage Ashram Managers', 'admin'),
('admin.manage_ashrams', 'Manage Ashrams', 'Create and manage Ashrams', 'admin'),
('admin.manage_packages', 'Manage Yatra Packages', 'Create and manage Yatra packages', 'admin'),
('admin.manage_places', 'Manage Spiritual Places', 'Create and manage Spiritual Places', 'admin'),
('admin.manage_pujas', 'Manage Puja Services', 'Create and manage Puja services', 'admin'),
('admin.manage_events', 'Manage Events', 'Create and manage Events', 'admin'),
('admin.manage_gallery', 'Manage Gallery', 'Create and manage Gallery media', 'admin'),
('admin.manage_videos', 'Manage Videos', 'Create and manage All Videos library', 'admin'),
('admin.manage_courses', 'Manage Courses', 'Create and manage Courses and lessons', 'admin'),
('admin.manage_articles', 'Manage Articles', 'Create and manage Wisdom / Guides', 'admin'),
('admin.manage_homepage', 'Manage Homepage', 'Manage homepage content, stats and sections', 'admin'),
('admin.manage_leads', 'Manage All Leads', 'View and manage all leads', 'admin'),
('admin.assign_leads', 'Assign Leads', 'Assign leads to Pandits/Sales/Managers', 'admin'),
('admin.manage_plans', 'Manage Subscription Plans', 'Create and change subscription plans', 'admin'),
('admin.manage_payments', 'Manage Payments', 'View and manage payment records', 'admin'),
('admin.manage_seo', 'Manage SEO', 'Manage metadata, SEO blocks and redirects', 'admin'),
('admin.view_reports', 'View Reports', 'View business reports and analytics', 'admin'),
('admin.view_audit_logs', 'View Audit Logs', 'View system activity logs', 'admin'),
('admin.manage_settings', 'Manage Settings', 'Manage system settings', 'admin');


INSERT OR IGNORE INTO permissions (code, name, description, module)
VALUES
('admin.manage_forms', 'Manage Forms', 'Manage public form definitions and submissions', 'forms'),
('admin.manage_crm', 'Manage CRM', 'Manage lead notes, follow-ups, communications and tags', 'crm'),
('admin.view_analytics', 'View Visitor Analytics', 'View visitor, page, interaction and conversion analytics', 'analytics'),
('admin.manage_analytics', 'Manage Analytics', 'Manage analytics goals and tracking settings', 'analytics'),
('admin.manage_seo_locations', 'Manage Location SEO', 'Manage country/state/district/city/area SEO landing pages', 'seo'),
('admin.view_seo_health', 'View SEO Health', 'View crawl and index health data', 'seo');


-- =========================================================
-- ROLE PERMISSIONS
-- =========================================================

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.code = 'visitor'
  AND p.code IN (
      'auth.view_profile',
      'auth.edit_profile',
      'pandit.view_listing',
      'temple.view'
  );

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.code = 'pandit'
  AND p.code IN (
      'auth.view_profile',
      'auth.edit_profile',
      'pandit.view_listing',
      'pandit.manage_own_profile',
      'pandit.view_own_leads',
      'pandit.update_own_leads',
      'pandit.manage_subscription',
      'temple.view'
  );

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.code = 'temple_manager'
  AND p.code IN (
      'auth.view_profile',
      'auth.edit_profile',
      'temple.view',
      'temple.manage_assigned',
      'temple.view_leads',
      'temple.manage_subscription'
  );

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.code = 'ashram_manager'
  AND p.code IN (
      'auth.view_profile',
      'auth.edit_profile',
      'ashram.view',
      'ashram.manage_assigned',
      'ashram.view_leads',
      'ashram.manage_programs',
      'ashram.manage_subscription'
  );

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.code = 'sales'
  AND p.code IN (
      'auth.view_profile',
      'auth.edit_profile',
      'pandit.view_listing',
      'sales.view_leads',
      'sales.manage_leads',
      'sales.view_pandits',
      'sales.manage_followups',
      'sales.view_ashrams',
      'sales.manage_ashram_subscriptions',
      'sales.view_subscriptions',
      'ashram.view',
      'temple.view'
  );

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.code = 'super_admin';


-- =========================================================
-- SEED TEMPLE CATEGORIES
-- =========================================================

INSERT OR IGNORE INTO temple_categories (name, slug, sort_order)
VALUES
('Jyotirlinga', 'jyotirlinga', 1),
('Shakti Peetha', 'shakti-peetha', 2),
('Char Dham', 'char-dham', 3),
('Ancient', 'ancient', 4),
('Heritage', 'heritage', 5),
('Vaishnava', 'vaishnava', 6),
('Shakta', 'shakta', 7),
('Shaiva', 'shaiva', 8),
('Himalayan', 'himalayan', 9),
('Coastal', 'coastal', 10),
('Sacred Pilgrimage', 'sacred-pilgrimage', 11),
('Hill Shrine', 'hill-shrine', 12),
('Shakti Peetha Circuit', 'shakti-peetha-circuit', 13);


-- =========================================================
-- =========================================================
-- FINAL SUBSCRIPTION PLANS
-- =========================================================

-- Deactivate legacy plan codes from older schema versions. They are retained
-- for historical records but must not be offered for new checkout sessions.
UPDATE subscription_plans
SET is_active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE code IN (
    'pandit_starter', 'pandit_growth', 'pandit_pro'
);

INSERT INTO subscription_plans
(
    code, audience, name, description, price_amount, currency,
    billing_interval, duration_days, lead_limit,
    service_limit, service_area_limit, gallery_limit, video_limit, program_limit,
    listing_enabled, featured_listing, priority_support, verification_badge,
    analytics_access, homepage_promotion, live_aarti_enabled, enhanced_seo,
    enhanced_profile, whatsapp_enquiry, search_visibility, analytics_level,
    plan_features_json, is_active, sort_order
)
VALUES
(
    'pandit_basic', 'pandit', 'Basic',
    'Basic Pandit presence with 10 lead credits per month.',
    199, 'INR', 'monthly', 30, 10,
    5, 2, 0, 0, 0,
    1, 0, 0, 1,
    1, 0, 0, 0,
    0, 1, 'standard', 'basic',
    '["Up to 5 services","10 leads/month","Up to 2 service cities","Public profile","WhatsApp enquiry","Basic analytics","Verification badge after approval"]',
    1, 1
),
(
    'pandit_premium', 'pandit', 'Premium',
    'Premium Pandit growth plan with 30 lead credits per month.',
    499, 'INR', 'monthly', 30, 30,
    15, 0, 0, 0, 0,
    1, 1, 1, 1,
    1, 1, 0, 1,
    1, 1, 'higher', 'advanced',
    '["Up to 15 services","30 leads/month","Multiple service cities","Featured listing","Higher search visibility","Enhanced SEO","Advanced analytics","Priority support","WhatsApp enquiry","Verification badge after approval"]',
    1, 2
),
(
    'temple_basic', 'temple', 'Basic',
    'Basic Temple presence with 15 enquiry credits per month.',
    499, 'INR', 'monthly', 30, 15,
    0, 0, 15, 2, 0,
    1, 0, 0, 1,
    1, 0, 0, 0,
    0, 1, 'standard', 'basic',
    '["Temple profile","Basic SEO","15 images","Up to 2 videos","15 leads/month","WhatsApp enquiry","Basic analytics","Verification badge after approval"]',
    1, 1
),
(
    'temple_premium', 'temple', 'Premium',
    'Premium Temple visibility with 50 enquiry credits per month.',
    999, 'INR', 'monthly', 30, 50,
    0, 0, 50, 10, 0,
    1, 1, 1, 1,
    1, 1, 1, 1,
    1, 1, 'higher', 'advanced',
    '["Temple profile","Enhanced SEO","50 images","Up to 10 videos","50 leads/month","Live Aarti","Featured listing","Homepage promotion","Advanced analytics","Priority support","WhatsApp enquiry","Verification badge after approval"]',
    1, 2
),
(
    'ashram_basic', 'ashram', 'Basic',
    'Basic Ashram presence with 15 enquiry credits per month.',
    499, 'INR', 'monthly', 30, 15,
    0, 0, 15, 2, 3,
    1, 0, 0, 1,
    1, 0, 0, 0,
    0, 1, 'standard', 'basic',
    '["Ashram profile","History & activities","Up to 3 programs/courses","15 images","Up to 2 videos","15 leads/month","WhatsApp enquiry","Basic analytics","Verification badge after approval"]',
    1, 1
),
(
    'ashram_premium', 'ashram', 'Premium',
    'Premium Ashram growth plan with 75 enquiry credits per month.',
    1499, 'INR', 'monthly', 30, 75,
    0, 0, 50, 10, 15,
    1, 1, 1, 1,
    1, 1, 0, 1,
    1, 1, 'higher', 'advanced',
    '["Ashram profile","Enhanced SEO","Up to 15 programs/courses","50 images","Up to 10 videos","75 leads/month","Featured listing","Homepage promotion","Advanced analytics","Priority support","WhatsApp enquiry","Verification badge after approval"]',
    1, 2
)
ON CONFLICT(code) DO UPDATE SET
    audience = excluded.audience,
    name = excluded.name,
    description = excluded.description,
    price_amount = excluded.price_amount,
    currency = excluded.currency,
    billing_interval = excluded.billing_interval,
    duration_days = excluded.duration_days,
    lead_limit = excluded.lead_limit,
    service_limit = excluded.service_limit,
    service_area_limit = excluded.service_area_limit,
    gallery_limit = excluded.gallery_limit,
    video_limit = excluded.video_limit,
    program_limit = excluded.program_limit,
    listing_enabled = excluded.listing_enabled,
    featured_listing = excluded.featured_listing,
    priority_support = excluded.priority_support,
    verification_badge = excluded.verification_badge,
    analytics_access = excluded.analytics_access,
    homepage_promotion = excluded.homepage_promotion,
    live_aarti_enabled = excluded.live_aarti_enabled,
    enhanced_seo = excluded.enhanced_seo,
    enhanced_profile = excluded.enhanced_profile,
    whatsapp_enquiry = excluded.whatsapp_enquiry,
    search_visibility = excluded.search_visibility,
    analytics_level = excluded.analytics_level,
    plan_features_json = excluded.plan_features_json,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    updated_at = CURRENT_TIMESTAMP;


-- DEFAULT BUSINESS FORMS
-- =========================================================

INSERT OR IGNORE INTO form_definitions
(form_key, name, module, entity_type, version, fields_json, creates_lead, creates_booking, success_message)
VALUES
('puja_enquiry', 'Puja Service Enquiry', 'puja', 'puja_service', 1,
 '["name","phone","email","city","district","state","puja_service_id","requested_date","preferred_time","service_mode","gotra","family_names","devotee_count","samagri_required","message"]',
 1, 0, 'Your puja enquiry has been received. Our team will contact you shortly.'),
('pandit_booking', 'Pandit Booking Enquiry', 'pandit', 'pandit', 1,
 '["name","phone","email","city","district","state","pandit_id","pandit_service_id","puja_service_id","requested_date","preferred_time","booking_mode","gotra","guest_count","message"]',
 1, 1, 'Your Pandit booking request has been received.'),
('yatra_enquiry', 'Yatra Package Enquiry', 'travel', 'yatra_package', 1,
 '["name","phone","email","departure_city","travel_start_date","travel_end_date","adults","children","seniors","rooms_required","preferred_transport","meal_preference","stay_preference","budget_amount","special_requirements","message"]',
 1, 0, 'Your Yatra enquiry has been received. Our travel team will contact you.'),
('temple_enquiry', 'Temple Enquiry', 'temple', 'temple', 1,
 '["name","phone","email","preferred_visit_date","preferred_time","devotees_count","live_aarti_request","puja_request","special_assistance","message"]',
 1, 0, 'Your temple enquiry has been received.'),
('ashram_enquiry', 'Ashram Enquiry', 'ashram', 'ashram', 1,
 '["name","phone","email","visit_start_date","visit_end_date","adults","children","stay_required","course_or_program","room_preference","food_preference","message"]',
 1, 0, 'Your ashram enquiry has been received.'),
('event_enquiry', 'Event Enquiry', 'event', 'event', 1,
 '["name","phone","email","attending_date","attendee_count","pass_type","message"]',
 1, 0, 'Your event enquiry has been received.'),
('course_enquiry', 'Course Enquiry', 'course', 'course', 1,
 '["name","phone","email","preferred_start_date","batch_preference","learner_count","mode","message"]',
 1, 0, 'Your course enquiry has been received.'),
('contact', 'General Contact Form', 'contact', NULL, 1,
 '["name","phone","email","subject","message"]',
 1, 0, 'Thank you. Your message has been received.');


INSERT OR IGNORE INTO form_definitions
(form_key, name, module, entity_type, version, fields_json, capture_mode, requires_phone_verification, creates_lead, creates_booking, success_message)
VALUES
('temple_detail_gate', 'Temple Detail Lead Gate', 'temple', 'temple', 1, '["name","email","phone","temple_id"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue to this Temple detail.'),
('pandit_detail_gate', 'Pandit Detail Lead Gate', 'pandit', 'pandit', 1, '["name","email","phone","pandit_id"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue to this Pandit detail.'),
('puja_detail_gate', 'Puja Service Detail Lead Gate', 'puja', 'puja_service', 1, '["name","email","phone","puja_service_id"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue to this Puja Service detail.'),
('ashram_detail_gate', 'Ashram Detail Lead Gate', 'ashram', 'ashram', 1, '["name","email","phone","ashram_id"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue to this Ashram detail.'),
('yatra_detail_gate', 'Yatra Package Detail Lead Gate', 'travel', 'yatra_package', 1, '["name","email","phone","yatra_package_id"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue to this Yatra Package detail.'),
('spiritual_place_detail_gate', 'Spiritual Place Detail Lead Gate', 'spiritual_place', 'spiritual_place', 1, '["name","email","phone","spiritual_place_id"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue to this Spiritual Place detail.'),
('event_detail_gate', 'Event Detail Lead Gate', 'event', 'event', 1, '["name","email","phone","event_id"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue to this Event detail.'),
('course_detail_gate', 'Course Detail Lead Gate', 'course', 'course', 1, '["name","email","phone","course_id"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue to this Course detail.'),
('kundli_capture', 'Kundli Lead Capture', 'kundli', 'kundli', 1, '["name","email","phone","birth_date","birth_time","birth_place"]', 'detail_gate', 1, 1, 0, 'Please verify your mobile number to continue with Kundli.');


-- =========================================================
-- DEFAULT ANALYTICS GOALS
-- =========================================================

INSERT OR IGNORE INTO analytics_goals (name, slug, event_name, goal_type)
VALUES
('Lead Submitted', 'lead-submitted', 'lead_submitted', 'conversion'),
('WhatsApp Click', 'whatsapp-click', 'whatsapp_click', 'conversion'),
('Phone Click', 'phone_click', 'phone_click', 'conversion'),
('Form Started', 'form-started', 'form_started', 'engagement'),
('Video Played', 'video-played', 'video_play', 'engagement'),
('Gallery Opened', 'gallery-opened', 'gallery_open', 'engagement');


-- =========================================================
-- DEFAULT SYSTEM SETTINGS
-- =========================================================

INSERT OR IGNORE INTO settings
(
    setting_key,
    setting_value,
    setting_type,
    description,
    is_public
)
VALUES
('site_name', 'DivyaDhara', 'string', 'Website/application name', 1),
('default_country', 'India', 'string', 'Default country', 1),
('payments_enabled', 'true', 'boolean', 'Enable payment/checkout functionality', 0),
('payment_provider', 'razorpay', 'string', 'Primary payment provider', 0),
('payment_environment', 'test', 'string', 'Payment environment', 0),
('payment_currency', 'INR', 'string', 'Default payment currency', 1),
('pandit_lead_assignment_mode', 'subscription_quota', 'string', 'Pandit lead assignment mode', 0),
('pandit_registration_requires_approval', 'true', 'boolean', 'Pandit registrations require approval', 0),
('temple_manager_registration_requires_approval', 'true', 'boolean', 'Temple Manager registrations require approval', 0),
('ashram_manager_registration_requires_approval', 'true', 'boolean', 'Ashram Manager registrations require approval', 0),
('sales_public_registration', 'false', 'boolean', 'Sales cannot register publicly', 0),
('super_admin_public_registration', 'false', 'boolean', 'Super Admin cannot register publicly', 0),
('video_listing_mode', 'all', 'string', 'Public video listing should show a single All Videos view', 1),
('analytics_enabled', 'true', 'boolean', 'Enable privacy-aware website analytics', 0),
('analytics_track_anonymous', 'true', 'boolean', 'Track anonymous visitors with a generated visitor key', 0),
('analytics_link_anonymous_on_login', 'true', 'boolean', 'Link anonymous visitor history to the account after login/registration', 0),
('analytics_record_essential_activity', 'true', 'boolean', 'Record essential security/business activity even before account registration', 0),
('analytics_session_timeout_minutes', '30', 'number', 'Inactivity window used to rotate anonymous web sessions', 0),
('public_registration_roles', '["visitor","pandit","temple_manager","ashram_manager"]', 'json', 'Roles allowed to start public registration', 0),
('analytics_store_ip_hash_only', 'true', 'boolean', 'Store IP as a one-way hash rather than raw IP', 0),
('lead_attribution_enabled', 'true', 'boolean', 'Store UTM/referrer/page attribution on leads and submissions', 0),
('lead_capture_enabled', 'true', 'boolean', 'Enable detail-page and form lead capture', 0),
('lead_capture_otp_provider', 'firebase', 'string', 'Phone verification provider for lead capture', 0),
('lead_capture_require_phone_verification', 'true', 'boolean', 'Require verified mobile before creating gated leads', 0),
('lead_capture_anonymous_enabled', 'true', 'boolean', 'Allow anonymous visitors to start lead-capture sessions', 0),
('lead_capture_modules', '["temple","pandit","puja_service","ashram","yatra","spiritual_place","event","course","kundli"]', 'json', 'Modules using detail-gate lead capture', 0),
('chatbot_enabled', 'true', 'boolean', 'Enable the Phase 3 AI chatbot foundation', 0),
('chatbot_role_guidance_enabled', 'true', 'boolean', 'Allow role-aware website guidance and maintenance help', 0),
('chatbot_lead_capture_enabled', 'true', 'boolean', 'Allow chatbot to collect qualified lead context', 0),
('chatbot_auto_lead_scoring_enabled', 'true', 'boolean', 'Allow automatic lead scoring from chatbot signals', 0),
('chatbot_retention_days', '180', 'number', 'AI conversation retention period in days', 0),
('seo_location_levels', '["country","state","district","city","area"]', 'json', 'Supported location levels for programmatic SEO', 0),
('seo_auto_generate_location_pages', 'false', 'boolean', 'Allow backend SEO jobs to generate location landing pages', 0),
('seo_require_unique_content', 'true', 'boolean', 'Require distinct content/data before publishing location SEO pages', 0);


-- =========================================================
-- DEFAULT SEO SETTINGS
-- =========================================================

INSERT OR IGNORE INTO seo_settings
(setting_key, setting_value, setting_type, description, is_public)
VALUES
('site_default_title',
 'DivyaDhara — Temples, Pandits, Pujas, Yatras & Spiritual Wisdom of India',
 'string',
 'Default SEO title',
 1),
('site_default_description',
 'Discover temples, pandits, puja services, ashrams, yatra packages, spiritual places, events, courses and sacred videos on DivyaDhara.',
 'string',
 'Default meta description',
 1),
('default_robots',
 'index,follow',
 'string',
 'Default robots directive',
 1),
('canonical_base_url',
 '',
 'string',
 'Canonical site URL. Set for deployment.',
 0);


-- =========================================================
-- CORE SEO LISTING ROUTES
-- =========================================================

INSERT OR IGNORE INTO seo_entries
(path, page_type, seo_title, meta_description, robots, is_indexable, status)
VALUES
('/',
 'home',
 'DivyaDhara — Temples, Pandits, Pujas, Yatras & Spiritual Wisdom of India',
 'Discover temples, pandits, puja services, ashrams, yatra packages, spiritual places, events, courses and sacred videos.',
 'index,follow', 1, 'published'),

('/temples',
 'temples',
 'Temples of India | DivyaDhara',
 'Explore temples, darshan timings, aarti schedules, traditions, festivals and sacred heritage across India.',
 'index,follow', 1, 'published'),

('/services',
 'puja_services',
 'Puja Services | DivyaDhara',
 'Book puja and Vedic services with transparent information, pricing and guidance.',
 'index,follow', 1, 'published'),

('/pandits',
 'pandits',
 'Book Verified Pandits & Acharyas | DivyaDhara',
 'Find verified Vedic pandits and acharyas for puja, rituals and spiritual services.',
 'index,follow', 1, 'published'),

('/ashrams',
 'ashrams',
 'Ashrams of India | DivyaDhara',
 'Explore ashrams, retreats, spiritual programs, stays and seva opportunities.',
 'index,follow', 1, 'published'),

('/packages',
 'yatra_packages',
 'Yatra Packages | DivyaDhara',
 'Explore curated pilgrimage and spiritual travel packages across India.',
 'index,follow', 1, 'published'),

('/spiritual-places',
 'spiritual_places',
 'Spiritual Places of India | DivyaDhara',
 'Discover sacred cities, dhams, temple towns and pilgrimage destinations.',
 'index,follow', 1, 'published'),

('/events',
 'events',
 'Spiritual Events & Festivals | DivyaDhara',
 'Discover upcoming festivals, kathas, yatras and spiritual events.',
 'index,follow', 1, 'published'),

('/gallery',
 'gallery',
 'Sacred Gallery | DivyaDhara',
 'Explore photographs and visual stories from temples, aarti, puja, ashrams and pilgrimages.',
 'index,follow', 1, 'published'),

('/videos',
 'videos',
 'Spiritual Videos | DivyaDhara',
 'Watch temple, puja, darshan, aarti and spiritual videos in the All Videos library.',
 'index,follow', 1, 'published'),

('/courses',
 'courses',
 'Spiritual Courses & Gurukul | DivyaDhara',
 'Learn Sanskrit, Gita, yoga, meditation, bhajan and living spiritual traditions.',
 'index,follow', 1, 'published');


-- =========================================================
-- DEFAULT DEEP SEO TEMPLATES
-- =========================================================

INSERT OR IGNORE INTO seo_templates
(template_key, page_type, title_template, meta_template, h1_template, intro_template)
VALUES
('service-location', 'puja_service_location',
 '{service_name} in {city} | {state} | DivyaDhara',
 'Book {service_name} in {city}, {district}, {state}. Explore pricing, availability, pandit options, FAQs and enquiry support.',
 '{service_name} in {city}',
 'Explore {service_name} services available in {city}, {district}, {state}, including enquiry support, pricing guidance and related spiritual services.'),
('pandit-location', 'pandit_location',
 'Book Pandit for {service_name} in {city} | DivyaDhara',
 'Find pandits for {service_name} in {city}, {district}, {state}. Compare profiles, languages, availability and service details.',
 'Pandit for {service_name} in {city}',
 'Find pandits and acharyas for {service_name} in {city}, {district}, {state}, with profile, service and enquiry information.'),
('yatra-location', 'yatra_location',
 '{package_name} from {city} | Yatra Packages | DivyaDhara',
 'Explore {package_name} from {city}, {state}. View dates, itinerary, pricing, inclusions and travel enquiry options.',
 '{package_name} from {city}',
 'Explore pilgrimage travel options for {package_name} from {city}, {district}, {state}, with itinerary and enquiry support.'),
('service-state', 'puja_service_state',
 '{service_name} in {state} | Puja Services | DivyaDhara',
 'Explore {service_name} in {state}, India. Check service details, pricing guidance and enquiry options.',
 '{service_name} in {state}',
 'Explore {service_name} availability across {state}, with location coverage, enquiry support and related services.'),
('service-district', 'puja_service_district',
 '{service_name} in {district}, {state} | DivyaDhara',
 'Explore {service_name} in {district}, {state}. Find local availability and enquiry support.',
 '{service_name} in {district}, {state}',
 'Explore {service_name} options in {district}, {state}, with local service information and enquiry support.');


-- =========================================================
-- DEFAULT ENTITY SEO TEMPLATES
-- =========================================================

INSERT OR IGNORE INTO seo_templates
(template_key, page_type, catalog_type, location_level, min_listings_to_index,
 title_template, meta_template, h1_template, intro_template,
 faq_template_json, schema_template_json, internal_links_template_json, breadcrumb_template_json)
VALUES
('temple-entity', 'temple', 'temple', NULL, 1,
 '{name} Temple | Darshan, Aarti & History | DivyaDhara',
 'Explore {name} Temple in {city_name}, {state_name}. View darshan timings, aarti, history, deity details, facilities and pilgrimage information.',
 '{name} Temple',
 'Explore the history, spiritual significance, darshan, aarti and visitor information for {name} Temple.',
 '[{"q":"What are the darshan timings of {name}?","a":"Check the latest published darshan schedule on this page."}]',
 '{"@context":"https://schema.org","@type":"HinduTemple"}',
 '[{"type":"location","anchor":"More temples in {city_name}"}]',
 '[{"name":"Home","url":"/"},{"name":"Temples","url":"/temples"},{"name":"{name}","url":"{canonical_url}"}]'),
('pandit-entity', 'pandit', 'pandit', NULL, 1,
 '{name} | Pandit & Vedic Priest | DivyaDhara',
 'View {name} profile, puja specialisations, languages, experience, service areas and enquiry options.',
 '{name}',
 'View the profile, expertise, puja services, languages, experience and service areas of {name}.',
 '[{"q":"Which puja services does {name} offer?","a":"Review the published service offerings on this Pandit profile."}]',
 '{"@context":"https://schema.org","@type":"Person"}',
 '[{"type":"location","anchor":"Pandits in {city_name}"}]',
 '[{"name":"Home","url":"/"},{"name":"Pandits","url":"/pandits"},{"name":"{name}","url":"{canonical_url}"}]'),
('puja-service-entity', 'puja_service', 'puja_service', NULL, 1,
 '{name} Puja | Procedure, Samagri, Benefits & Booking | DivyaDhara',
 'Learn about {name}, including procedure, samagri, benefits, duration, pricing guidance, location availability and booking support.',
 '{name}',
 'Explore the procedure, samagri, benefits, duration, pricing guidance and booking information for {name}.',
 '[{"q":"What is included in {name}?","a":"See the published samagri, procedure and service details on this page."}]',
 '{"@context":"https://schema.org","@type":"Service"}',
 '[{"type":"location","anchor":"Puja services near you"}]',
 '[{"name":"Home","url":"/"},{"name":"Puja Services","url":"/services"},{"name":"{name}","url":"{canonical_url}"}]'),
('ashram-entity', 'ashram', 'ashram', NULL, 1,
 '{name} Ashram | Stay, Retreats, Programs & Facilities | DivyaDhara',
 'Explore {name} Ashram in {city_name}, {state_name}, including spiritual stays, retreats, programs, facilities and enquiry information.',
 '{name} Ashram',
 'Discover the traditions, facilities, spiritual programs, stay options and visitor information for {name} Ashram.',
 '[{"q":"Does {name} offer a spiritual stay?","a":"Check the stay and retreat information published on this page."}]',
 '{"@context":"https://schema.org","@type":"Place"}',
 '[{"type":"location","anchor":"Ashrams in {city_name}"}]',
 '[{"name":"Home","url":"/"},{"name":"Ashrams","url":"/ashrams"},{"name":"{name}","url":"{canonical_url}"}]');


-- =========================================================
-- DEFAULT ENTITY SEO TEMPLATES — EXTENDED CATALOGUE
-- =========================================================

INSERT OR IGNORE INTO seo_templates
(template_key, page_type, catalog_type, location_level, min_listings_to_index,
 title_template, meta_template, h1_template, intro_template, schema_template_json)
VALUES
('yatra-entity', 'yatra_package', 'yatra', NULL, 1,
 '{name} | Yatra Package, Itinerary & Pricing | DivyaDhara',
 'Explore {name}: destinations, dates, itinerary, stay, transport, inclusions, exclusions and booking enquiry information.',
 '{name}',
 'Explore the pilgrimage itinerary, dates, travel arrangements, stay details and booking information for {name}.',
 '{"@context":"https://schema.org","@type":"TouristTrip"}'),
('place-entity', 'spiritual_place', 'spiritual_place', NULL, 1,
 '{name} | Spiritual Place & Pilgrimage Guide | DivyaDhara',
 'Discover {name}, including significance, attractions, best time to visit, how to reach and nearby sacred places.',
 '{name}',
 'Discover the spiritual significance, attractions, travel information and nearby sacred places for {name}.',
 '{"@context":"https://schema.org","@type":"Place"}'),
('event-entity', 'event', 'event', NULL, 1,
 '{name} | Event Date, Venue & Details | DivyaDhara',
 'View {name} details including date, time, venue, schedule, organiser, fee and registration information.',
 '{name}',
 'View the date, venue, schedule, organiser and visitor information for {name}.',
 '{"@context":"https://schema.org","@type":"Event"}'),
('gallery-entity', 'gallery', 'gallery', NULL, 1,
 '{name} | Sacred Gallery | DivyaDhara',
 'Explore sacred photographs and visual stories from DivyaDhara.',
 '{name}',
 'Explore this sacred photo collection and visual story.',
 '{"@context":"https://schema.org","@type":"ImageGallery"}'),
('video-entity', 'video', 'video', NULL, 1,
 '{name} | Spiritual Video | DivyaDhara',
 'Watch {name} on DivyaDhara with temple, puja, darshan, aarti or spiritual context.',
 '{name}',
 'Watch and explore the spiritual context of {name}.',
 '{"@context":"https://schema.org","@type":"VideoObject"}'),
('course-entity', 'course', 'course', NULL, 1,
 '{name} | Spiritual Course | DivyaDhara',
 'Explore {name}, including instructor, duration, mode, curriculum, schedule, eligibility and fee information.',
 '{name}',
 'Explore the instructor, curriculum, schedule, eligibility and enrolment information for {name}.',
 '{"@context":"https://schema.org","@type":"Course"}'),
('article-entity', 'article', 'article', NULL, 1,
 '{name} | Wisdom & Guide | DivyaDhara',
 'Read {name} on DivyaDhara with practical spiritual, pilgrimage and ritual guidance.',
 '{name}',
 'Read this DivyaDhara wisdom and pilgrimage guide.',
 '{"@context":"https://schema.org","@type":"Article"}');


-- =========================================================
-- DEFAULT SEO LISTING CONTROLS
-- =========================================================

INSERT OR IGNORE INTO seo_listing_controls
(catalog_type, base_path, detail_path_template,
 indexable_location_levels_json,
 min_country_listings, min_state_listings, min_district_listings, min_city_listings,
 noindex_query_parameters_json, canonical_query_strategy)
VALUES
('temple', '/temples', '/temples/{location_path}/{slug}',
 '["country","state","district","city"]', 3, 3, 3, 3,
 '["q","search","sort","page","category","deity","tradition","featured"]', 'location_path'),
('pandit', '/pandits', '/pandits/{location_path}/{slug}',
 '["country","state","district","city"]', 5, 5, 5, 3,
 '["q","search","sort","page","language","specialization","puja_type","experience_min","experience_max","featured"]', 'location_path'),
('puja_service', '/services', '/services/{location_path}/{slug}',
 '["country","state","district","city"]', 3, 3, 3, 3,
 '["q","search","sort","page","category","deity","price_min","price_max","featured"]', 'location_path'),
('ashram', '/ashrams', '/ashrams/{location_path}/{slug}',
 '["country","state","district","city"]', 3, 3, 3, 2,
 '["q","search","sort","page","tradition","stay","retreat","featured"]', 'location_path');


-- =========================================================
-- DEFAULT DEEP CATALOGUE SEO TEMPLATES
-- =========================================================
-- URL placeholders:
--   {country_slug} / {state_slug} / {district_slug} / {city_slug}
--   {country_name} / {state_name} / {district_name} / {city_name}
--
-- Listing pages are generated only when the resulting content has enough
-- genuine catalogue records; thin combinations should remain noindex.

INSERT OR IGNORE INTO seo_templates
(template_key, page_type, catalog_type, location_level, slug_pattern, canonical_pattern,
 min_listings_to_index, title_template, meta_template, h1_template, intro_template,
 faq_template_json, schema_template_json, internal_links_template_json, breadcrumb_template_json)
VALUES
('temple-listing-country', 'temple_listing', 'temple', 'country',
 '/temples/{country_slug}', '/temples/{country_slug}', 3,
 'Temples in {country_name} | DivyaDhara',
 'Explore verified temple listings, darshan details, aarti timings, history and pilgrimage information across {country_name}.',
 'Temples in {country_name}',
 'Discover temples, sacred traditions, darshan information and pilgrimage resources across {country_name}.',
 '[{"q":"Which temples can I visit in {country_name}?","a":"Explore the published temple directory for {country_name}."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"state","anchor":"Temples by State"}]',
 '[{"name":"Home","url":"/"},{"name":"Temples","url":"/temples"},{"name":"{country_name}","url":"/temples/{country_slug}"}]'),
('temple-listing-state', 'temple_listing', 'temple', 'state',
 '/temples/{country_slug}/{state_slug}', '/temples/{country_slug}/{state_slug}', 3,
 'Temples in {state_name} | DivyaDhara',
 'Find temples in {state_name}, including darshan timings, aarti, deity, history and pilgrimage information by district and city.',
 'Temples in {state_name}',
 'Explore temples across {state_name}, organised by district and city for easier pilgrimage planning.',
 '[{"q":"Which temples are in {state_name}?","a":"Browse published temples across districts and cities in {state_name}."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"district","anchor":"Temples by District"}]',
 '[{"name":"Home","url":"/"},{"name":"Temples","url":"/temples"},{"name":"{state_name}","url":"/temples/{country_slug}/{state_slug}"}]'),
('temple-listing-district', 'temple_listing', 'temple', 'district',
 '/temples/{country_slug}/{state_slug}/{district_slug}', '/temples/{country_slug}/{state_slug}/{district_slug}', 3,
 'Temples in {district_name}, {state_name} | DivyaDhara',
 'Discover temples in {district_name}, {state_name}, with city-wise listings, darshan, aarti and spiritual information.',
 'Temples in {district_name}, {state_name}',
 'Browse temples across cities in {district_name}, {state_name}, with practical darshan and pilgrimage information.',
 '[{"q":"Which temples are in {district_name}?","a":"Explore the published temple directory for this district."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"city","anchor":"Temples by City"}]',
 '[{"name":"Home","url":"/"},{"name":"Temples","url":"/temples"},{"name":"{state_name}","url":"/temples/{country_slug}/{state_slug}"},{"name":"{district_name}","url":"/temples/{country_slug}/{state_slug}/{district_slug}"}]'),
('temple-listing-city', 'temple_listing', 'temple', 'city',
 '/temples/{country_slug}/{state_slug}/{district_slug}/{city_slug}', '/temples/{country_slug}/{state_slug}/{district_slug}/{city_slug}', 3,
 'Temples in {city_name}, {district_name} | DivyaDhara',
 'Find temples in {city_name}, {district_name}, {state_name}. Explore darshan timings, aarti, deity details, history and contact information.',
 'Temples in {city_name}, {district_name}',
 'Explore temples in {city_name}, {district_name}, with city-level pilgrimage information and published temple details.',
 '[{"q":"Which temples are in {city_name}?","a":"Browse the published temple directory for {city_name}."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"temple","anchor":"Temples in {city_name}"}]',
 '[{"name":"Home","url":"/"},{"name":"Temples","url":"/temples"},{"name":"{state_name}","url":"/temples/{country_slug}/{state_slug}"},{"name":"{district_name}","url":"/temples/{country_slug}/{state_slug}/{district_slug}"},{"name":"{city_name}","url":"/temples/{country_slug}/{state_slug}/{district_slug}/{city_slug}"}]'),

('pandit-listing-country', 'pandit_listing', 'pandit', 'country',
 '/pandits/{country_slug}', '/pandits/{country_slug}', 5,
 'Pandits in {country_name} | Verified Hindu Priests | DivyaDhara',
 'Find verified pandits and acharyas in {country_name}. Explore languages, specialisations, puja services and service areas.',
 'Pandits in {country_name}',
 'Find published pandit profiles and Hindu priest services across {country_name}, with city and state discovery.',
 '[{"q":"How can I find a pandit in {country_name}?","a":"Use the location and service filters to find published pandit profiles."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"state","anchor":"Pandits by State"}]',
 '[{"name":"Home","url":"/"},{"name":"Pandits","url":"/pandits"},{"name":"{country_name}","url":"/pandits/{country_slug}"}]'),
('pandit-listing-state', 'pandit_listing', 'pandit', 'state',
 '/pandits/{country_slug}/{state_slug}', '/pandits/{country_slug}/{state_slug}', 5,
 'Pandits in {state_name} | Verified Priests | DivyaDhara',
 'Find pandits in {state_name} for puja, rituals, sanskar and spiritual ceremonies by district and city.',
 'Pandits in {state_name}',
 'Explore published pandit profiles across {state_name}, with specialisations, languages and service areas.',
 '[{"q":"How do I find a pandit in {state_name}?","a":"Browse published profiles and filter by city or service."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"district","anchor":"Pandits by District"}]',
 '[{"name":"Home","url":"/"},{"name":"Pandits","url":"/pandits"},{"name":"{state_name}","url":"/pandits/{country_slug}/{state_slug}"}]'),
('pandit-listing-district', 'pandit_listing', 'pandit', 'district',
 '/pandits/{country_slug}/{state_slug}/{district_slug}', '/pandits/{country_slug}/{state_slug}/{district_slug}', 5,
 'Pandits in {district_name}, {state_name} | DivyaDhara',
 'Find pandits in {district_name}, {state_name}, by city, puja expertise, language and service area.',
 'Pandits in {district_name}, {state_name}',
 'Browse published pandit profiles serving cities across {district_name}, {state_name}.',
 '[{"q":"Which pandits are available in {district_name}?","a":"Explore published profiles serving this district."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"city","anchor":"Pandits by City"}]',
 '[{"name":"Home","url":"/"},{"name":"Pandits","url":"/pandits"},{"name":"{state_name}","url":"/pandits/{country_slug}/{state_slug}"},{"name":"{district_name}","url":"/pandits/{country_slug}/{state_slug}/{district_slug}"}]'),
('pandit-listing-city', 'pandit_listing', 'pandit', 'city',
 '/pandits/{country_slug}/{state_slug}/{district_slug}/{city_slug}', '/pandits/{country_slug}/{state_slug}/{district_slug}/{city_slug}', 3,
 'Pandits in {city_name}, {district_name} | DivyaDhara',
 'Find verified pandits in {city_name}, {district_name}, {state_name} for puja, havan, sanskar and spiritual ceremonies.',
 'Pandits in {city_name}, {district_name}',
 'Explore published pandit profiles serving {city_name}, with languages, expertise, availability and enquiry options.',
 '[{"q":"How can I book a pandit in {city_name}?","a":"Browse the published profiles and submit an enquiry to a suitable pandit."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"pandit","anchor":"Pandits in {city_name}"}]',
 '[{"name":"Home","url":"/"},{"name":"Pandits","url":"/pandits"},{"name":"{state_name}","url":"/pandits/{country_slug}/{state_slug}"},{"name":"{district_name}","url":"/pandits/{country_slug}/{state_slug}/{district_slug}"},{"name":"{city_name}","url":"/pandits/{country_slug}/{state_slug}/{district_slug}/{city_slug}"}]'),

('puja-listing-country', 'puja_listing', 'puja_service', 'country',
 '/services/{country_slug}', '/services/{country_slug}', 3,
 'Puja Services in {country_name} | DivyaDhara',
 'Explore puja services available across {country_name}, including rituals, havan, abhishek, sanskar and home puja options.',
 'Puja Services in {country_name}',
 'Discover published puja services and location-aware availability across {country_name}.',
 '[{"q":"Which puja services are available in {country_name}?","a":"Browse published puja services with location availability."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"state","anchor":"Puja Services by State"}]',
 '[{"name":"Home","url":"/"},{"name":"Puja Services","url":"/services"},{"name":"{country_name}","url":"/services/{country_slug}"}]'),
('puja-listing-state', 'puja_listing', 'puja_service', 'state',
 '/services/{country_slug}/{state_slug}', '/services/{country_slug}/{state_slug}', 3,
 'Puja Services in {state_name} | DivyaDhara',
 'Find puja services in {state_name} by district and city, with ritual details, pricing guidance and enquiry support.',
 'Puja Services in {state_name}',
 'Explore location-aware puja services across {state_name}, including home and temple service areas.',
 '[{"q":"What puja services are available in {state_name}?","a":"Browse published services available in this state."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"district","anchor":"Puja Services by District"}]',
 '[{"name":"Home","url":"/"},{"name":"Puja Services","url":"/services"},{"name":"{state_name}","url":"/services/{country_slug}/{state_slug}"}]'),
('puja-listing-district', 'puja_listing', 'puja_service', 'district',
 '/services/{country_slug}/{state_slug}/{district_slug}', '/services/{country_slug}/{state_slug}/{district_slug}', 3,
 'Puja Services in {district_name}, {state_name} | DivyaDhara',
 'Discover puja services in {district_name}, {state_name}, with city-wise availability and enquiry support.',
 'Puja Services in {district_name}, {state_name}',
 'Explore published puja services available across cities in {district_name}, {state_name}.',
 '[{"q":"Which puja services are available in {district_name}?","a":"Browse published services mapped to this district."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"city","anchor":"Puja Services by City"}]',
 '[{"name":"Home","url":"/"},{"name":"Puja Services","url":"/services"},{"name":"{state_name}","url":"/services/{country_slug}/{state_slug}"},{"name":"{district_name}","url":"/services/{country_slug}/{state_slug}/{district_slug}"}]'),
('puja-listing-city', 'puja_listing', 'puja_service', 'city',
 '/services/{country_slug}/{state_slug}/{district_slug}/{city_slug}', '/services/{country_slug}/{state_slug}/{district_slug}/{city_slug}', 3,
 'Puja Services in {city_name}, {district_name} | DivyaDhara',
 'Explore puja services in {city_name}, {district_name}, {state_name}, including rituals, pricing guidance and enquiry support.',
 'Puja Services in {city_name}, {district_name}',
 'Discover published puja services available in {city_name}, with location-aware enquiry and booking support.',
 '[{"q":"Which puja services are available in {city_name}?","a":"Browse published services mapped to {city_name}."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"puja_service","anchor":"Puja Services in {city_name}"}]',
 '[{"name":"Home","url":"/"},{"name":"Puja Services","url":"/services"},{"name":"{state_name}","url":"/services/{country_slug}/{state_slug}"},{"name":"{district_name}","url":"/services/{country_slug}/{state_slug}/{district_slug}"},{"name":"{city_name}","url":"/services/{country_slug}/{state_slug}/{district_slug}/{city_slug}"}]'),

('ashram-listing-country', 'ashram_listing', 'ashram', 'country',
 '/ashrams/{country_slug}', '/ashrams/{country_slug}', 3,
 'Ashrams in {country_name} | Spiritual Retreats | DivyaDhara',
 'Discover ashrams in {country_name}, including spiritual stays, retreats, programs, facilities and enquiry information.',
 'Ashrams in {country_name}',
 'Explore published ashrams and spiritual retreat options across {country_name}.',
 '[{"q":"Where can I find ashrams in {country_name}?","a":"Browse the published ashram directory and filter by state and city."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"state","anchor":"Ashrams by State"}]',
 '[{"name":"Home","url":"/"},{"name":"Ashrams","url":"/ashrams"},{"name":"{country_name}","url":"/ashrams/{country_slug}"}]'),
('ashram-listing-state', 'ashram_listing', 'ashram', 'state',
 '/ashrams/{country_slug}/{state_slug}', '/ashrams/{country_slug}/{state_slug}', 3,
 'Ashrams in {state_name} | Retreats & Spiritual Stays | DivyaDhara',
 'Explore ashrams in {state_name}, with district and city-wise information about retreats, stays, programs and facilities.',
 'Ashrams in {state_name}',
 'Discover published ashrams across {state_name}, organised by district and city.',
 '[{"q":"Which ashrams are in {state_name}?","a":"Browse published ashrams and filter further by district and city."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"district","anchor":"Ashrams by District"}]',
 '[{"name":"Home","url":"/"},{"name":"Ashrams","url":"/ashrams"},{"name":"{state_name}","url":"/ashrams/{country_slug}/{state_slug}"}]'),
('ashram-listing-district', 'ashram_listing', 'ashram', 'district',
 '/ashrams/{country_slug}/{state_slug}/{district_slug}', '/ashrams/{country_slug}/{state_slug}/{district_slug}', 3,
 'Ashrams in {district_name}, {state_name} | DivyaDhara',
 'Find ashrams in {district_name}, {state_name}, with city-wise retreat, stay, program and spiritual information.',
 'Ashrams in {district_name}, {state_name}',
 'Explore published ashrams across cities in {district_name}, {state_name}.',
 '[{"q":"Which ashrams are in {district_name}?","a":"Browse published ashrams serving this district."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"city","anchor":"Ashrams by City"}]',
 '[{"name":"Home","url":"/"},{"name":"Ashrams","url":"/ashrams"},{"name":"{state_name}","url":"/ashrams/{country_slug}/{state_slug}"},{"name":"{district_name}","url":"/ashrams/{country_slug}/{state_slug}/{district_slug}"}]'),
('ashram-listing-city', 'ashram_listing', 'ashram', 'city',
 '/ashrams/{country_slug}/{state_slug}/{district_slug}/{city_slug}', '/ashrams/{country_slug}/{state_slug}/{district_slug}/{city_slug}', 2,
 'Ashrams in {city_name}, {district_name} | DivyaDhara',
 'Discover ashrams in {city_name}, {district_name}, {state_name}, including stays, retreats, programs and facilities.',
 'Ashrams in {city_name}, {district_name}',
 'Explore published ashrams in {city_name}, with practical stay, retreat and programme information.',
 '[{"q":"Which ashrams are in {city_name}?","a":"Browse published ashrams in this city."}]',
 '{"@context":"https://schema.org","@type":"ItemList"}',
 '[{"type":"ashram","anchor":"Ashrams in {city_name}"}]',
 '[{"name":"Home","url":"/"},{"name":"Ashrams","url":"/ashrams"},{"name":"{state_name}","url":"/ashrams/{country_slug}/{state_slug}"},{"name":"{district_name}","url":"/ashrams/{country_slug}/{state_slug}/{district_slug}"},{"name":"{city_name}","url":"/ashrams/{country_slug}/{state_slug}/{district_slug}/{city_slug}"}]');


-- =========================================================
-- EXTENDED LOCATION SEO TEMPLATES FOR SECONDARY CATALOGUES
-- =========================================================

INSERT OR IGNORE INTO seo_templates
(template_key, page_type, catalog_type, location_level, min_listings_to_index,
 title_template, meta_template, h1_template, intro_template, schema_template_json)
VALUES
('spiritual-place-listing-city', 'spiritual_place_listing', 'spiritual_place', 'city', 2,
 'Spiritual Places in {city_name}, {state_name} | DivyaDhara',
 'Discover spiritual places in {city_name}, {district_name}, {state_name}, including sacred cities, dhams and pilgrimage attractions.',
 'Spiritual Places in {city_name}',
 'Explore spiritual places, pilgrimage attractions and sacred heritage around {city_name}.',
 '{"@context":"https://schema.org","@type":"ItemList"}'),
('event-listing-city', 'event_listing', 'event', 'city', 2,
 'Spiritual Events in {city_name}, {state_name} | DivyaDhara',
 'Find upcoming spiritual events, festivals, kathas and gatherings in {city_name}, {district_name}, {state_name}.',
 'Spiritual Events in {city_name}',
 'Discover upcoming spiritual events and festivals in {city_name}.',
 '{"@context":"https://schema.org","@type":"ItemList"}'),
('course-listing-city', 'course_listing', 'course', 'city', 1,
 'Spiritual Courses in {city_name}, {state_name} | DivyaDhara',
 'Explore spiritual courses, yoga, Sanskrit, Gita, meditation and devotional learning in {city_name}, {state_name}.',
 'Spiritual Courses in {city_name}',
 'Explore learning opportunities connected with {city_name} and its spiritual traditions.',
 '{"@context":"https://schema.org","@type":"ItemList"}'),
('yatra-listing-city', 'yatra_listing', 'yatra', 'city', 1,
 'Yatra Packages from {city_name}, {state_name} | DivyaDhara',
 'Explore pilgrimage packages from {city_name}, {state_name}, with dates, itinerary, pricing and travel enquiry support.',
 'Yatra Packages from {city_name}',
 'Explore pilgrimage travel options originating from or routed through {city_name}.',
 '{"@context":"https://schema.org","@type":"ItemList"}');


-- =========================================================
-- HOMEPAGE DEFAULT SECTIONS
-- =========================================================

INSERT OR IGNORE INTO homepage_sections
(section_key, eyebrow, title, subtitle, cta_label, cta_url, sort_order)
VALUES
('featured_temples', 'Sacred Kshetras', 'Featured Temples of Bharat', 'Jyotirlingas, Char Dham seats and living heritage.', 'All temples', '/temples', 10),
('live_aarti', 'Live · Daily', 'Live Aarti & Darshan', 'Watch live aarti, darshan and recordings.', 'Watch videos', '/videos', 20),
('puja_services', 'Sevas at Home & Kshetra', 'Puja Services, Done Right', 'Transparent pricing, muhurat guidance and samagri information.', 'All services', '/services', 30),
('pandits', 'Verified Acharyas', 'Pandits You Can Trust', 'Parampara-trained and verification-led profiles.', 'Meet all pandits', '/pandits', 40),
('events', 'Utsav & Satsang', 'Upcoming Spiritual Events', 'Festivals, kathas, yatras and spiritual gatherings.', 'All events', '/events', 50),
('ashrams', 'Tapobhumi', 'Ashram Highlights', 'Explore spiritual stays, seva and learning.', 'Explore all ashrams', '/ashrams', 60),
('courses', 'Vidya & Sadhana', 'Learn the Living Traditions', 'Sanskrit, Gita, yoga, meditation and bhajan.', 'All courses', '/courses', 70),
('yatra_packages', 'Sacred Travel', 'Signature Yatra Packages', 'Curated pilgrimages with darshan and stay assistance.', 'All packages', '/packages', 80),
('spiritual_places', 'Tirtha Kshetra', 'Popular Pilgrimage Places', 'Holy cities, dhams and temple towns.', 'All spiritual places', '/spiritual-places', 90),
('gallery', 'Darshan Gallery', 'Glimpses of the Sacred', 'Temples at dawn, aarti flames and Himalayan trails.', 'Open gallery', '/gallery', 100),
('articles', 'Jnana', 'Wisdom & Guides', 'Panchang primers, yatra checklists and ritual explainers.', 'Read all articles', '/articles', 110);


-- =========================================================
-- DEFAULT CRM TAGS
-- =========================================================

INSERT OR IGNORE INTO lead_tags (name, slug) VALUES
('New Lead', 'new-lead'),
('High Intent', 'high-intent'),
('WhatsApp Requested', 'whatsapp-requested'),
('Call Requested', 'call-requested'),
('Puja', 'puja'),
('Pandit', 'pandit'),
('Yatra', 'yatra'),
('Temple', 'temple'),
('Ashram', 'ashram'),
('SEO Lead', 'seo-lead');


-- =========================================================
-- CENTRAL CONTENT / GEO / SEARCH INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_content_sync_lookup
    ON content_sync_registry(content_type, source_file, source_key, sync_status);

CREATE INDEX IF NOT EXISTS idx_temples_peetha
    ON temples(peetha_number, status);
CREATE INDEX IF NOT EXISTS idx_temples_rating
    ON temples(rating_text);
CREATE INDEX IF NOT EXISTS idx_ashrams_geo_filter_2
    ON ashrams(country_location_id, state_location_id, district_location_id, city_location_id, status);
CREATE INDEX IF NOT EXISTS idx_spiritual_places_geo_filter
    ON spiritual_places(country_location_id, state_location_id, district_location_id, city_location_id, status, featured);
CREATE INDEX IF NOT EXISTS idx_events_geo_filter
    ON events(country_location_id, state_location_id, district_location_id, city_location_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_yatra_packages_geo_filter
    ON yatra_packages(country_location_id, state_location_id, district_location_id, city_location_id, status, featured);
CREATE INDEX IF NOT EXISTS idx_courses_geo_filter
    ON courses(country_location_id, state_location_id, district_location_id, city_location_id, status, featured);
CREATE INDEX IF NOT EXISTS idx_gallery_geo_filter
    ON gallery_items(country_location_id, state_location_id, district_location_id, city_location_id, status);
CREATE INDEX IF NOT EXISTS idx_videos_geo_filter
    ON videos(country_location_id, state_location_id, district_location_id, city_location_id, status, featured);
CREATE INDEX IF NOT EXISTS idx_articles_geo_filter
    ON articles(country_location_id, state_location_id, district_location_id, city_location_id, status, published_at);
CREATE INDEX IF NOT EXISTS idx_puja_services_category_status
    ON puja_services(category, status, featured);
CREATE INDEX IF NOT EXISTS idx_pandit_services_name
    ON pandit_service_offerings(name, is_active);
CREATE INDEX IF NOT EXISTS idx_ashram_programs_type
    ON ashram_programs(program_type, is_active);
CREATE INDEX IF NOT EXISTS idx_gallery_tag
    ON gallery_items(tag, status, featured);
CREATE INDEX IF NOT EXISTS idx_videos_provider_external
    ON videos(video_provider, external_video_id);
CREATE INDEX IF NOT EXISTS idx_courses_category_level
    ON courses(category, level, status);
CREATE INDEX IF NOT EXISTS idx_articles_category_date
    ON articles(category, article_date, published_at);


-- =========================================================
-- COMMIT
-- =========================================================

COMMIT;
