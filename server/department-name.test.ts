import { describe, expect, it } from "vitest";
import { canonicalDepartmentName, departmentNameKey, matchDepartmentName, normalizeArabic } from "./department-name";

describe("تطبيع أسماء الأقسام (تصحيح الأخطاء الإملائية)", () => {
  it("يوحّد الهمزات والتشكيل والتاء المربوطة", () => {
    expect(normalizeArabic("أحكام")).toBe("احكام");
    expect(normalizeArabic("إدارةُ الدعوى")).toBe("اداره الدعوي");
    expect(normalizeArabic("قسم الوثائق والمحفوظات")).toBe("قسم الوثايق والمحفوظات");
  });

  it("يحذف البادئات الإدارية ويوحّد مفتاح القسم", () => {
    expect(departmentNameKey("إدارة الدعوى")).toBe("دعوي");
    expect(departmentNameKey("قسم الدعاوى")).toBe("دعاوي");
    expect(departmentNameKey("إدارة الأحكام")).toBe("احكام");
  });

  it("يوحّد المفرد والجمع في الاسم المعتمد", () => {
    expect(canonicalDepartmentName("إدارة الدعوى")).toBe("الدعاوى");
    expect(canonicalDepartmentName("إدارة الدعاوى")).toBe("الدعاوى");
    expect(canonicalDepartmentName("قسم الدعاوي")).toBe("الدعاوى");
  });

  it("لا يعامل كلمة «الملازم» كخطأ إملائي ويوحّدها مع «الملازمين»", () => {
    expect(canonicalDepartmentName("شؤون الملازم")).toBe("شؤون الملازمين");
    expect(canonicalDepartmentName("شؤون الملازمين")).toBe("شؤون الملازمين");
    const candidates = ["شؤون الملازمين", "الدعاوى", "تسليم الأحكام"];
    expect(matchDepartmentName(candidates, "شؤون الملازم")).toBe("شؤون الملازمين");
    expect(matchDepartmentName(candidates, "قسم شؤون الملازم")).toBe("شؤون الملازمين");
  });

  it("يطابق القسم الصحيح رغم اختلاف التهجئة", () => {
    const candidates = ["تسليم الأحكام", "الوثائق والمحفوظات", "الدعاوى", "خدمات المستفيدين"];
    expect(matchDepartmentName(candidates, "إدارة الدعوى")).toBe("الدعاوى");
    expect(matchDepartmentName(candidates, "تسليم الاحكام")).toBe("تسليم الأحكام");
    expect(matchDepartmentName(candidates, "خدمات المستفيدين")).toBe("خدمات المستفيدين");
    expect(matchDepartmentName(candidates, "قسم غير موجود")).toBeNull();
  });
});
