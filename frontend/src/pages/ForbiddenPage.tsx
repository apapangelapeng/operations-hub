import { LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";

export function ForbiddenPage() {
  return (
    <div className="centered-state">
      <div className="state-icon">
        <LockKeyhole size={28} />
      </div>
      <h1>Access restricted</h1>
      <p>Your role does not include permission for this workspace.</p>
      <Link to="/" className="button primary">
        Return home
      </Link>
    </div>
  );
}
