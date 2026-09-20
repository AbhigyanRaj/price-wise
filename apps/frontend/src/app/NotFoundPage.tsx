import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { NotFound } from "@/components/data/States";

export function NotFoundPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);

  // Focus moves to the heading on mount. Without it a keyboard or screen
  // reader user who mistypes a URL lands in silence, with no indication that
  // the navigation failed at all.
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="px-4 py-10 md:px-[34px]">
      <h1 ref={heading} tabIndex={-1} className="sr-only">
        Page not found
      </h1>
      <NotFound
        path={pathname}
        action={{ label: "Back to overview", onClick: () => navigate("/") }}
      />
    </div>
  );
}
