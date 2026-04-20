-- ============================================================
--  002_seed_dev.sql
--  Seed data for development (approved circuits).
-- ============================================================

INSERT INTO approved_circuits (name, short_name, flag, country, layout) VALUES
    ('Algarve International Circuit', 'Portimão', '🇵🇹', 'Portugal', 'Algarve International Circuit'),
    ('Autodromo Nazionale Monza',     'Monza',    '🇮🇹', 'Italy',    'Autodromo Nazionale Monza'),
    ('Autodromo Nazionale Monza',     'Monza',    '🇮🇹', 'Italy',    'Monza Curva Grande Circuit'),
    ('Bahrain International Circuit', 'Bahrain',  '🇧🇭', 'Bahrain',  'Bahrain International Circuit'),
    ('Bahrain International Circuit', 'Bahrain',  '🇧🇭', 'Bahrain',  'Bahrain Endurance Circuit'),
    ('Bahrain International Circuit', 'Bahrain',  '🇧🇭', 'Bahrain',  'Bahrain Outer Circuit'),
    ('Bahrain International Circuit', 'Bahrain',  '🇧🇭', 'Bahrain',  'Bahrain Paddock Circuit'),
    ('Circuit de Spa-Francorchamps',  'Spa',      '🇧🇪', 'Belgium',  'Circuit de Spa-Francorchamps'),
    ('Circuit de Spa-Francorchamps',  'Spa',      '🇧🇪', 'Belgium',  'Circuit de Spa-Francorchamps Endurance'),
    ('Circuit de la Sarthe',          'Le Mans',  '🇫🇷', 'France',   'Circuit de la Sarthe'),
    ('Circuit de la Sarthe',          'Le Mans',  '🇫🇷', 'France',   'Circuit de la Sarthe Mulsanne'),
    ('Fuji Speedway',                 'Fuji',     '🇯🇵', 'Japan',    'Fuji Speedway'),
    ('Fuji Speedway',                 'Fuji',     '🇯🇵', 'Japan',    'Fuji Speedway Classic')
ON CONFLICT (name, layout) DO NOTHING;
