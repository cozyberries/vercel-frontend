// Dropdown vocabularies extracted from the Flipkart kids_apparel_combo template
// (Index sheet + DropDownValuesForColumnNN sheets). A value outside these lists
// fails Flipkart QC, so mapping.ts validates every cell against them.

export const IDEAL_FOR = [
  "Baby Boys", "Baby Boys & Baby Girls", "Baby Girls", "Boys", "Boys & Girls", "Girls",
] as const satisfies readonly string[];

export const PRIMARY_PRODUCT_TYPE = [
  "Bandana", "Bangle", "Belt", "Bib", "Blazer", "Bloomer", "Bodysuit", "Bootie", "Bow Tie",
  "Bra", "Bracelet", "Brief", "Camisole", "Cap", "Capri", "Cardigan", "Choli", "Clutch",
  "Coat", "Cravat", "Dress", "Dungaree", "Dungaree and Romper", "Earring", "Gloves", "Gown",
  "Hair Band", "Hairclip", "Handbag", "Handkerchief", "Hat", "Jacket", "Jeans", "Jegging",
  "Jumpsuit", "Kids Lehenga Choli", "Kurta", "Legging", "Mitten", "Muffler", "Necklace",
  "Pant", "Panty", "Pocket Square", "Poncho", "Pouch", "Pullover", "Pyjama", "Ring", "Robe",
  "Romper", "Scarf", "Shirt", "Shorts", "Shrug", "Skirt", "Slingbag", "Slippers", "Socks",
  "Stole", "Sunglass", "Suspenders", "Swaddle", "Sweater", "Sweatpant", "Sweatshirt",
  "T-shirt", "Three Fourth Pant", "Tie", "Top", "Track Pants", "Track Suit", "Trouser",
  "Tunic", "Vest", "Waistcoat", "Wrist Watch",
] as const satisfies readonly string[];

export const SECONDARY_PRODUCT_TYPE = [
  "Bandana", "Bangle", "Belt", "Bib", "Blazer", "Bloomer", "Bodysuit", "Bootie", "Bow Tie",
  "Bra", "Bracelet", "Brief", "Camisole", "Cap", "Capri", "Cardigan", "Choli", "Clutch",
  "Coat", "Cravat", "Dhoti Pant", "Dress", "Dungaree", "Earring", "Gloves", "Gown",
  "Hair Band", "Hairband", "Hairclip", "Handbag", "Handkerchief", "Hat", "Jacket", "Jeans",
  "Jegging", "Jumpsuit", "Legging", "Mitten", "Muffler", "Necklace", "Pant", "Panty",
  "Pocket Square", "Poncho", "Pouch", "Pullover", "Pyjama", "Ring", "Robe", "Romper",
  "Scarf", "Shirt", "Shorts", "Shrug", "Skirt", "Sleepsuit", "Slingbag", "Slippers",
  "Socks", "Stole", "Sunglass", "Suspenders", "Swaddle", "Sweater", "Sweatpant",
  "Sweatshirt", "T-shirt", "Three Fourth Pant", "Tiara", "Tie", "Top", "Track Pants",
  "Track Suit", "Trouser", "Tunic", "Vest", "Waistcoat", "Wrist Watch",
] as const satisfies readonly string[];

export const FABRIC = [
  "Acrylic", "Chanderi", "Chiffon", "Corduroy", "Cotton", "Cotton Blend", "Cotton Jersey",
  "Cotton Jute Blend", "Cotton Linen Blend", "Cotton Lycra Blend", "Cotton Silk",
  "Cotton Viscose Rayon", "Crepe", "Denim", "Feather", "Fleece", "Fur", "Georgette",
  "Hosiery", "Jacquard", "Jute", "Khadi", "Lace", "Leather", "Linen", "Lycra Blend",
  "Muslin", "Net", "Nylon", "Organic Cotton", "Polycotton", "Polyester", "Polyester Blend",
  "Pure Cotton", "Pure Silk", "Rayon Blend", "Satin", "Silk Blend", "Tissue", "Tweed",
  "Velvet", "Viscose Rayon", "Wool",
] as const satisfies readonly string[];

export const PATTERN = [
  "Animal Print", "Applique", "Bandhani", "Camouflage", "Cartoon/Superhero", "Checkered",
  "Chevron/Zig Zag", "Colorblock", "Embellished", "Embossed", "Embroidered", "Floral Print",
  "Geometric Print", "Graphic Print", "Paisley", "Polka Print", "Printed", "Self Design",
  "Solid", "Striped", "Text Print", "Washed/Dyed", "Woven",
] as const satisfies readonly string[];

export const OCCASION = ["Casual", "Party(Festive)"] as const satisfies readonly string[];

export const FABRIC_CARE = [
  "Cold water wash only", "Do not Iron on print/embroidery/embellishment", "Do not bleach",
  "Do not dry clean", "Do not iron", "Do not steam iron", "Do not tumble dry",
  "Do not wring", "Dry clean only", "Dry flat", "Dry in shade",
  "First wash dry clean thereafter hand wash", "Gentle Machine Wash", "Hand wash",
  "Machine wash as per tag", "Regular Machine Wash", "Reverse and dry", "Reverse and iron",
  "Slight color may bleed in all washes", "Slight color may bleed in first wash",
  "Slight shrinkage would be expected", "Wash with like colors",
] as const satisfies readonly string[];

export const BRAND_SIZE = [
  "Boys (11 - 12) Years / Girls (2 - 3) Years", "Boys (11 - 12) Years / Girls (3 - 4) Years",
  "0 - 1 Month", "0 - 3 Months", "0 - 6 Months", "3 - 6 Months", "6 - 9 Months",
  "6 - 12 Months", "9 - 12 Months", "12 - 18 Months", "18 - 24 Months", "1 - 2 Years",
  "2 - 3 Years", "3 - 4 Years", "2 - 4 Years", "4 - 5 Years", "5 - 6 Years", "4 - 6 Years",
  "6 - 7 Years", "6 - 8 Years", "7 - 8 Years", "8 - 9 Years", "9 - 10 Years", "8 - 10 Years",
  "10 - 11 Years", "11 - 12 Years", "10 - 12 Years", "12 - 13 Years", "13 - 14 Years",
  "12 - 14 Years", "14 - 15 Years", "15 - 16 Years", "14 - 16 Years",
] as const satisfies readonly string[];

export const PRIMARY_COLOR = [
  "Beige", "Black", "Blue", "Brown", "Dark Blue", "Dark Green", "Gold", "Green", "Grey",
  "Light Blue", "Light Green", "Maroon", "Multicolor", "Orange", "Pink", "Purple", "Red",
  "Silver", "White", "Yellow",
] as const satisfies readonly string[];

export const SLEEVE_LENGTH = [
  "3/4 Sleeve", "Full Sleeve", "Half Sleeve", "NA", "Short Sleeve", "Sleeveless",
] as const satisfies readonly string[];

export const ORNAMENTATION_TYPE = [
  "Applique", "Beads & Stones", "Buttons", "Cut Work", "Embroidered", "Kantha Work", "Lace",
  "Mirror Work", "None", "Patch Work", "Pom Poms", "Schiffily", "Sequins", "Tassels",
  "Thread Work", "Zari Work",
] as const satisfies readonly string[];

export const TAX_CODE = [
  "GST_0", "GST_0.25", "GST_18", "GST_3", "GST_40", "GST_5", "GST_APPAREL", "GST_Footwear",
  "GST_Old_12_New_0", "GST_Old_12_New_5", "GST_Old_12_new_18", "GST_Old_18_New_0",
  "GST_Old_18_New_40", "GST_Old_18_New_5", "GST_Old_28_New_18", "GST_Old_28_New_40",
  "GST_Old_28_New_5", "GST_Old_5_New_0", "GST_Old_5_New_18",
] as const satisfies readonly string[];

export const CHARACTER = [
  "Angry Birds", "Avengers", "Barbie", "Batman", "Ben 10", "Captain America", "Chhota Bheem",
  "Daisy", "Dinosaur", "Disney Princess", "Donald", "Dora", "Doraemon", "Frozen", "Garfield",
  "Goofy", "Hello Kitty", "Hulk", "Iron Man", "Jungle Book", "Kung Fu Panda", "Looney Toons",
  "Mickey", "Minnie", "Minnions", "Motu Patlu", "NA", "Ninja Hattori", "No Character",
  "Peppa Pig", "Pluto", "Pokemon", "Spiderman", "Sponge Bob", "Steffi Love", "Superman",
  "Tom & Jerry", "Transformers", "Tweety", "WWE", "Winnie the Pooh",
  // "Minnions" and "Looney Toons" are Flipkart's own spellings — preserve them verbatim.
] as const satisfies readonly string[];

// A separate 16-value dropdown from `Pattern` (column 38). Conflating the two would
// pass Flipkart QC while writing a value the dropdown doesn't actually offer.
export const PATTERN_PRINT_TYPE = [
  "Animal Print", "Applique", "Argyle", "Characters", "Checkered", "Chevron", "Floral Print",
  "Geometric Print", "Graphic Print", "Herringbone", "Houndstooth", "Paisley", "Polka Print",
  "Solid", "Striped", "Woven Design",
] as const satisfies readonly string[];

// Sheet order, not numeric order — this is how Flipkart's own dropdown lists it.
export const NUMBER_OF_APPAREL_COMBO = [
  "1", "10", "2", "3", "4", "5", "6", "7", "8", "9",
] as const satisfies readonly string[];

export const DETAIL_PLACEMENT = [
  "All - Over", "Back", "Front Panel", "Hemline", "Neckline", "Sleeve", "Slits", "Yoke",
] as const satisfies readonly string[];

/** Same 20 values as Primary Color — Flipkart backs both columns with one vocabulary. */
export const SECONDARY_COLOR = PRIMARY_COLOR;

/**
 * Country Of Origin (column 26). The template's example cell reads "IN for
 * India", but the dropdown holds full country names and "IN" is not among
 * them — sending the code fails QC. India is first, exactly as in the sheet.
 */
export const COUNTRY_OF_ORIGIN = [
  "India", "Afghanistan", "Aland Islands", "Albania", "Algeria", "American Samoa", "Andorra",
  "Angola", "Anguilla", "Antarctica", "Antigua and Barbuda", "Argentina", "Armenia", "Aruba",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados",
  "Belarus", "Belgium", "Belize", "Benin", "Bermuda", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Bouvet Island", "Brazil",
  "British Indian Ocean Territory", "British Virgin Islands", "Brunei Darussalam", "Bulgaria",
  "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Cayman Islands",
  "Central African Republic", "Chad", "Chile", "China", "Christmas Island",
  "Cocos (Keeling) Islands", "Colombia", "Comoros", "Congo (Brazzaville)", "Congo, (Kinshasa)",
  "Cook Islands", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Côte d'Ivoire",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Falkland Islands (Malvinas)",
  "Faroe Islands", "Fiji", "Finland", "France", "French Guiana", "French Polynesia",
  "French Southern Territories", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Gibraltar",
  "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guernsey", "Guinea",
  "Guinea-Bissau", "Guyana", "Haiti", "Heard and Mcdonald Islands",
  "Holy See (Vatican City State)", "Honduras", "Hong Kong, SAR China", "Hungary", "Iceland",
  "Indonesia", "Iran", "Iraq", "Ireland", "Isle of Man", "Israel", "Italy", "Jamaica", "Japan",
  "Jersey", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea (North)", "Korea (South)",
  "Kuwait", "Kyrgyzstan", "Lao PDR", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Macao, SAR China", "Macedonia", "Madagascar",
  "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Martinique",
  "Mauritania", "Mauritius", "Mayotte", "Mexico", "Micronesia", "Moldova", "Monaco",
  "Mongolia", "Montenegro", "Montserrat", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nauru", "Nepal", "Netherlands", "Netherlands Antilles", "New Caledonia", "New Zealand",
  "Nicaragua", "Niger", "Nigeria", "Niue", "Norfolk Island", "Northern Mariana Islands",
  "Norway", "Oman", "Pakistan", "Palau", "Palestinian Territory", "Panama", "Papua New Guinea",
  "Paraguay", "Peru", "Philippines", "Pitcairn", "Poland", "Portugal", "Puerto Rico", "Qatar",
  "Romania", "Russian Federation", "Rwanda", "Réunion", "Saint Helena",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Pierre and Miquelon",
  "Saint Vincent and Grenadines", "Saint-Barthélemy", "Saint-Martin (French part)", "Samoa",
  "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles",
  "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia",
  "South Africa", "South Georgia and the South Sandwich Islands", "South Sudan", "Spain",
  "Sri Lanka", "Sudan", "Suriname", "Svalbard and Jan Mayen Islands", "Swaziland", "Sweden",
  "Switzerland", "Syrian Arab Republic (Syria)", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Timor-Leste", "Togo", "Tokelau", "Tonga", "Trinidad and Tobago", "Tunisia",
  "Turkey", "Turkmenistan", "Turks and Caicos Islands", "Tuvalu", "US Minor Outlying Islands",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States of America",
  "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela (Bolivarian Republic)", "Viet Nam",
  "Virgin Islands, US", "Wallis and Futuna Islands", "Western Sahara", "Yemen", "Zambia",
  "Zimbabwe",
] as const satisfies readonly string[];

/** QC: "Allowed values are: FA,seller,SellerSmart" (service_profile). */
export const FULFILMENT_BY = ["FA", "seller", "SellerSmart"] as const satisfies readonly string[];

/** QC: allowed procurement_type values from the bulk upload's own error text. */
export const PROCUREMENT_TYPE = [
  "QUICK", "REGULAR", "EXPRESS", "DOMESTIC", "MADE_TO_ORDER", "INTERNATIONAL",
] as const satisfies readonly string[];

/** Only these two are meaningful for a seller-managed listing. */
export const LISTING_STATUS = ["ACTIVE", "INACTIVE"] as const satisfies readonly string[];
