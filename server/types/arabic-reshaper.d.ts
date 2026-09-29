declare module "arabic-reshaper" {
  const arabicReshaper: {
    convertArabic(text: string): string;
    convertArabicBack(text: string): string;
  };
  export default arabicReshaper;
}
