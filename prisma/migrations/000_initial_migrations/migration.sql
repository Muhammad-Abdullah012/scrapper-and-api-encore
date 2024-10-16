-- Create the 'cities_encore' table
CREATE TABLE IF NOT EXISTS cities_encore (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ(6) DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

-- Create the 'urls_encore' table
CREATE TABLE IF NOT EXISTS urls_encore (
    id SERIAL PRIMARY KEY,
    url VARCHAR(2048) UNIQUE NOT NULL,
    is_processed BOOLEAN DEFAULT FALSE,
    city_id INTEGER,
    created_at TIMESTAMPTZ(6) DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) DEFAULT NOW(),
    CONSTRAINT fk_urls_encore_city FOREIGN KEY (city_id) REFERENCES cities_encore (id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- Create the 'raw_encore' table
CREATE TABLE IF NOT EXISTS raw_encore (
    id SERIAL PRIMARY KEY,
    url VARCHAR(2048) UNIQUE NOT NULL,
    is_processed BOOLEAN DEFAULT FALSE,
    city_id INTEGER,
    html TEXT DEFAULT '',
    created_at TIMESTAMPTZ(6) DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) DEFAULT NOW(),
    CONSTRAINT fk_raw_encore_city FOREIGN KEY (city_id) REFERENCES cities_encore (id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE properties_encore (
    id SERIAL PRIMARY KEY,
    url VARCHAR(2048) UNIQUE NOT NULL,
    city_id INTEGER,
    title TEXT DEFAULT '',
    main_features TEXT [] DEFAULT '{}',
    description TEXT DEFAULT '',
    last_updated VARCHAR(255) DEFAULT '',
    created_at TIMESTAMPTZ(6) DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) DEFAULT NOW(),
    CONSTRAINT fk_properties_encore_city FOREIGN KEY (city_id) REFERENCES cities_encore (id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX idx_urls_encore_city_id ON urls_encore (city_id);

CREATE INDEX idx_raw_encore_city_id ON raw_encore (city_id);

CREATE INDEX idx_properties_encore_city_id ON properties_encore (city_id);