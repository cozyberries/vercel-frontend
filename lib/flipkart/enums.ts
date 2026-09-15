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

export const CHARACTER = ["NA", "No Character"] as const satisfies readonly string[];
