const COURSE_BANNERS: Record<string, string> = {
  first_step_7days: "/assets/final-thumbnails/course_start.webp",
  ai_practical: "/assets/final-thumbnails/course_practical.webp",
};

export function courseBanner(courseId: string): string | null {
  return COURSE_BANNERS[courseId] ?? null;
}
