insert into public.currencies (code, decimals, name, label) values
('XOF',0,'Franc CFA BCEAO','FCFA'),('XAF',0,'Franc CFA BEAC','FCFA'),
('GNF',0,'Franc guinéen','GNF'),('RWF',0,'Franc rwandais','RWF'),('UGX',0,'Shilling ougandais','UGX'),
('NGN',2,'Naira nigérian','NGN'),('GHS',2,'Cedi ghanéen','GHS'),('KES',2,'Shilling kényan','KES'),
('TZS',2,'Shilling tanzanien','TZS'),('MAD',2,'Dirham marocain','MAD'),('DZD',2,'Dinar algérien','DZD'),
('EGP',2,'Livre égyptienne','EGP'),('ZAR',2,'Rand sud-africain','ZAR'),('EUR',2,'Euro','EUR'),
('USD',2,'Dollar américain','USD'),('GBP',2,'Livre sterling','GBP'),('CAD',2,'Dollar canadien','CAD'),
('CHF',2,'Franc suisse','CHF'),('TND',3,'Dinar tunisien','TND');

insert into public.countries (code, name, currency_code) values
('BJ','Bénin','XOF'),('TG','Togo','XOF'),('SN','Sénégal','XOF'),('CI','Côte d''Ivoire','XOF'),
('ML','Mali','XOF'),('BF','Burkina Faso','XOF'),('NE','Niger','XOF'),
('CM','Cameroun','XAF'),('GA','Gabon','XAF'),('GN','Guinée','GNF'),('NG','Nigeria','NGN'),
('GH','Ghana','GHS'),('KE','Kenya','KES'),('UG','Ouganda','UGX'),('TZ','Tanzanie','TZS'),
('RW','Rwanda','RWF'),('MA','Maroc','MAD'),('TN','Tunisie','TND'),('DZ','Algérie','DZD'),
('EG','Égypte','EGP'),('ZA','Afrique du Sud','ZAR'),('FR','France','EUR');
