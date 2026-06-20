import { redirect } from "next/navigation";

// The standalone "Assessment library" page is retired — instruments now live on
// the Assessments page (template strip + Assessments tab). Authoring still lives
// at /library/new. Keep the route as a redirect so existing links don't 404.
export default function LibraryRedirect() {
  redirect("/assessments");
}
