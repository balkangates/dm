-- Real marketplace taxonomy, not demo products or offers.
INSERT INTO categories (name, slug, sort_order) VALUES
('Fren Sistemi', 'fren-sistemi', 1),
('Filtreler', 'filtreler', 2),
('Motor Parçaları', 'motor-parcalari', 3),
('Süspansiyon', 'suspansiyon', 4),
('Elektrik & Akü', 'elektrik-aku', 5),
('Aydınlatma', 'aydinlatma', 6),
('Kaporta', 'kaporta', 7),
('Yağ & Sıvılar', 'yag-sivilar', 8)
ON CONFLICT (slug) DO NOTHING;
