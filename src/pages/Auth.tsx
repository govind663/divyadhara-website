import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { Link, useNavigate } from "react-router-dom";

import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  HeartHandshake,
  Lock,
  ImagePlus,
  LogIn,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Upload,
  X,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";

import {
  getDashboardPathForRole,
  type RegisterInput,
  useApp,
} from "../context/AppContext";

import { showError, showWarning } from "../lib/swal";
import { useSEO } from "../lib/seo";
import { Breadcrumbs, Reveal } from "../components/ui";

/*
|--------------------------------------------------------------------------
| Shared Shell
|--------------------------------------------------------------------------
*/

function Shell({
  title,
  sub,
  children,
  wide = false,
}: {
  title: string;
  sub: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-cream-50 py-10 md:py-16">
      <div
        className="mandala-bg absolute inset-0 opacity-50"
        aria-hidden="true"
      />

      <div
        className={`relative mx-auto px-4 ${wide ? "max-w-5xl" : "max-w-md"}`}
      >
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: title },
          ]}
        />

        <Reveal className="mt-6 overflow-hidden rounded-[1.75rem] border border-orange-900/10 bg-white shadow-2xl shadow-orange-900/10">
          <div className="bg-linear-to-br from-saffron-900 via-saffron-700 to-orange-600 px-7 pb-8 pt-8 text-center text-white md:px-10">
            <p
              className="font-sanskrit text-4xl text-amber-200"
              aria-hidden="true"
            >
              ॐ
            </p>

            <h1 className="font-display mt-1 text-3xl font-semibold md:text-4xl">
              {title}
            </h1>

            <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-orange-100/90">
              {sub}
            </p>
          </div>

          <div className="p-6 md:p-8">{children}</div>
        </Reveal>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Input Styles
|--------------------------------------------------------------------------
*/

const inputClass =
  "w-full rounded-xl border border-orange-900/15 bg-orange-50/40 px-4 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-60";

const inputWithIconClass = `${inputClass} pl-10`;

/*
|--------------------------------------------------------------------------
| Canonical Public Roles
|--------------------------------------------------------------------------
|
| Only these four roles are allowed to self-register from the public site.
| Sales and Super Admin remain internal-only and are intentionally excluded.
|--------------------------------------------------------------------------
*/

type PublicRole =
  | "visitor"
  | "pandit"
  | "temple_manager"
  | "ashram_manager";

type RoleOption = {
  role: PublicRole;
  label: string;
  shortLabel: string;
  description: string;
  approval: string;
  icon: typeof User;
};

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: "visitor",
    label: "Visitor / Devotee",
    shortLabel: "Explore & Book",
    description:
      "Explore temples, discover pujas, plan yatras, save sacred places and manage your enquiries.",
    approval: "Instant account access",
    icon: User,
  },
  {
    role: "pandit",
    label: "Pandit / Acharya",
    shortLabel: "Offer Services",
    description:
      "Build your professional profile, publish Puja services and receive qualified enquiries.",
    approval: "Admin approval required",
    icon: Sparkles,
  },
  {
    role: "temple_manager",
    label: "Temple Manager",
    shortLabel: "Manage Temple",
    description:
      "Represent a temple and manage assigned temple information, content and enquiries.",
    approval: "Admin approval + assignment",
    icon: Building2,
  },
  {
    role: "ashram_manager",
    label: "Ashram Manager",
    shortLabel: "Manage Ashram",
    description:
      "Represent an Ashram and manage assigned Ashram information, programs and enquiries.",
    approval: "Admin approval + assignment",
    icon: HeartHandshake,
  },
];

function csvToArray(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function roleNeedsApproval(role: PublicRole): boolean {
  return role !== "visitor";
}

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

export function Login() {
  useSEO({
    title: "Login — DivyaDhara",
    description:
      "Securely login to your DivyaDhara account and continue to the dashboard assigned to your role.",
    path: "/login",
  });

  const { login, isLoading, authError, clearAuthError } = useApp();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearAuthError();
    setSubmitted(true);

    const email = form.email.trim().toLowerCase();

    if (!email) {
      await showWarning("Email required", "Please enter your email address.");
      setSubmitted(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await showWarning("Invalid email", "Please enter a valid email address.");
      setSubmitted(false);
      return;
    }

    if (!form.password) {
      await showWarning("Password required", "Please enter your password.");
      setSubmitted(false);
      return;
    }

    try {
      const authenticatedUser = await login({
        email,
        password: form.password,
      });

      /*
       * Do not derive dashboard routing from a client-selected role.
       * AppContext returns the backend-authenticated role and the canonical
       * mapping below sends the user to the correct role-specific dashboard.
       */
      navigate(getDashboardPathForRole(authenticatedUser.role), {
        replace: true,
      });
    } catch {
      /* AppContext owns the user-facing authentication error. */
    } finally {
      setSubmitted(false);
    }
  };

  return (
    <Shell
      title="Swagatam Back"
      sub="Login to DivyaDhara and continue from the dashboard assigned to your account role."
    >
      {authError && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-bold">Login unsuccessful</p>
          <p className="mt-1 leading-5">{authError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            className="mb-1.5 block text-xs font-bold text-stone-600"
            htmlFor="login-email"
          >
            Email address
          </label>

          <div className="relative">
            <Mail
              size={16}
              className="absolute left-3.5 top-3.5 text-orange-500"
              aria-hidden="true"
            />

            <input
              id="login-email"
              required
              autoFocus
              autoComplete="email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }));
                clearAuthError();
              }}
              placeholder="you@example.com"
              className={inputWithIconClass}
            />
          </div>
        </div>

        <div>
          <label
            className="mb-1.5 block text-xs font-bold text-stone-600"
            htmlFor="login-password"
          >
            Password
          </label>

          <div className="relative">
            <Lock
              size={16}
              className="absolute left-3.5 top-3.5 text-orange-500"
              aria-hidden="true"
            />

            <input
              id="login-password"
              required
              minLength={8}
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }));
                clearAuthError();
              }}
              placeholder="Minimum 8 characters"
              className={`${inputWithIconClass} pr-12`}
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-lg text-stone-400 transition hover:bg-orange-50 hover:text-orange-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || submitted}
          className="btn-saffron flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading || submitted ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Signing in...
            </>
          ) : (
            <>
              <LogIn size={16} />
              Login Securely
            </>
          )}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between gap-4 text-[13px]">
        <Link to="/forgot-password" className="font-bold text-orange-700 hover:underline">
          Forgot password?
        </Link>

        <Link to="/register" className="font-bold text-orange-700 hover:underline">
          New here? Register
        </Link>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-orange-50/70 p-4 ring-1 ring-orange-100">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-orange-600" />

        <div>
          <p className="text-xs font-bold text-stone-800">Secure role-based access</p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
            After login, DivyaDhara reads the authenticated backend role and
            opens only that role's dashboard. Changing a URL does not grant
            access to another role's dashboard or data.
          </p>
        </div>
      </div>
    </Shell>
  );
}

/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/


export function Register() {
  useSEO({
    title: "Register — Join DivyaDhara",
    description:
      "Create a DivyaDhara account as a Visitor, Pandit, Temple Manager or Ashram Manager.",
    path: "/register",
  });

  const { register, isLoading, authError, clearAuthError } = useApp();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState<PublicRole>("visitor");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    country: "India",

    password: "",
    confirmPassword: "",

    /* Visitor */
    preferredLanguage: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    pincode: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    marketingConsent: false,

    /* Pandit */
    title: "",
    experienceYears: "",
    district: "",
    languages: "",
    specializations: "",
    pujaTypes: "",
    associatedWith: "",
    about: "",
    availability: "",
    serviceAreas: "",

    /* Temple / Ashram manager */
    designation: "",
    organizationName: "",

    /* Optional persistent image URL.
       The current account API accepts avatar text and Pandit profiles accept
       a photo URL. A selected local file is previewed immediately; a future
       media-upload endpoint can replace this URL flow without changing roles. */
    photoUrl: "",
  });

  const selectedRoleConfig = useMemo(
    () =>
      ROLE_OPTIONS.find((item) => item.role === selectedRole) ??
      ROLE_OPTIONS[0],
    [selectedRole],
  );

  const updateField = (
    field: keyof typeof form,
    value: string | boolean,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    clearAuthError();
    setSuccessMessage(null);
  };

  const selectRole = (role: PublicRole) => {
    setSelectedRole(role);
    clearAuthError();
    setSuccessMessage(null);
    setPhotoError(null);
  };

  const clearPhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoPreview(null);
    setPhotoName("");
    setPhotoError(null);

    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    setPhotoError(null);

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select a valid image file.");
      clearPhoto();
      return;
    }

    const maxBytes = 3 * 1024 * 1024;
    if (file.size > maxBytes) {
      setPhotoError("Profile photo must be 3 MB or smaller.");
      clearPhoto();
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoPreview(previewUrl);
    setPhotoName(file.name);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    clearAuthError();
    setSuccessMessage(null);
    setPhotoError(null);
    setSubmitted(true);

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const city = form.city.trim();
    const state = form.state.trim();
    const country = form.country.trim() || "India";
    const password = form.password;
    const confirmPassword = form.confirmPassword;

    if (!name || name.length < 2) {
      await showWarning(
        "Name required",
        "Please enter a valid full name with at least 2 characters.",
      );
      setSubmitted(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await showWarning(
        "Invalid email",
        "Please enter a valid email address.",
      );
      setSubmitted(false);
      return;
    }

    if (!/^[+0-9()\-\s]{7,20}$/.test(phone)) {
      await showWarning(
        "Invalid mobile number",
        "Please enter a valid mobile number.",
      );
      setSubmitted(false);
      return;
    }

    if (!city) {
      await showWarning("City required", "Please enter your city.");
      setSubmitted(false);
      return;
    }

    if (password.length < 8 || password.length > 128) {
      await showWarning(
        "Invalid password",
        "Password must contain between 8 and 128 characters.",
      );
      setSubmitted(false);
      return;
    }

    if (password !== confirmPassword) {
      await showWarning(
        "Passwords do not match",
        "Password and confirm password must be the same.",
      );
      setSubmitted(false);
      return;
    }

    if (selectedRole === "visitor") {
      const emergencyPhone = form.emergencyContactPhone.trim();

      if (emergencyPhone && !/^[+0-9()\-\s]{7,20}$/.test(emergencyPhone)) {
        await showWarning(
          "Invalid emergency contact",
          "Please enter a valid emergency contact number.",
        );
        setSubmitted(false);
        return;
      }

      if (form.pincode.trim() && form.pincode.trim().length > 20) {
        await showWarning(
          "Invalid PIN code",
          "Please enter a valid PIN/postal code.",
        );
        setSubmitted(false);
        return;
      }
    }

    if (selectedRole === "pandit") {
      const experience = form.experienceYears.trim();

      if (experience) {
        const experienceNumber = Number(experience);

        if (
          !Number.isInteger(experienceNumber) ||
          experienceNumber < 0 ||
          experienceNumber > 100
        ) {
          await showWarning(
            "Invalid experience",
            "Pandit experience must be between 0 and 100 years.",
          );
          setSubmitted(false);
          return;
        }
      }

      if (!form.title.trim()) {
        await showWarning(
          "Professional title required",
          "Add your Pandit / Acharya title so devotees understand your professional role.",
        );
        setSubmitted(false);
        return;
      }

      if (!form.pujaTypes.trim()) {
        await showWarning(
          "Puja types required",
          "Add at least one Puja/service type you offer.",
        );
        setSubmitted(false);
        return;
      }
    }

    if (
      selectedRole === "temple_manager" ||
      selectedRole === "ashram_manager"
    ) {
      if (!form.designation.trim()) {
        await showWarning(
          "Designation required",
          `Please enter your ${selectedRole === "temple_manager" ? "Temple" : "Ashram"} management designation.`,
        );
        setSubmitted(false);
        return;
      }

      if (!form.organizationName.trim()) {
        await showWarning(
          "Organisation name required",
          `Please enter the ${selectedRole === "temple_manager" ? "temple/trust" : "ashram/trust"} name.`,
        );
        setSubmitted(false);
        return;
      }
    }

    const photoUrl = form.photoUrl.trim();

    if (
      photoUrl &&
      !/^(https?:\/\/|\/|\.\/)/i.test(photoUrl)
    ) {
      await showWarning(
        "Invalid photo URL",
        "Use a valid HTTP(S) URL or a relative image path.",
      );
      setSubmitted(false);
      return;
    }

    /*
     * IMPORTANT:
     * The selected local file is a UX preview in this registration step.
     * It is not converted into a large base64 payload because the current
     * account API stores image references as text and the general API body
     * limit is intentionally small. The persistent field remains photoUrl.
     *
     * This keeps registration safe and prevents database bloat while leaving
     * a clear place for a dedicated media-storage endpoint to be integrated.
     */
    const payload = {
      role: selectedRole,
      name,
      email,
      phone,
      city,
      state,
      country,
      password,

      ...(photoUrl
        ? {
            avatar: photoUrl,
          }
        : {}),

      ...(selectedRole === "visitor"
        ? {
            preferredLanguage:
              form.preferredLanguage.trim(),
            dateOfBirth: form.dateOfBirth.trim(),
            gender: form.gender.trim(),
            address: form.address.trim(),
            pincode: form.pincode.trim(),
            emergencyContactName:
              form.emergencyContactName.trim(),
            emergencyContactPhone:
              form.emergencyContactPhone.trim(),
            marketingConsent:
              form.marketingConsent,
          }
        : {}),

      ...(selectedRole === "pandit"
        ? {
            title: form.title.trim(),
            experienceYears:
              form.experienceYears.trim(),
            district: form.district.trim(),
            languages: csvToArray(form.languages),
            specializations:
              csvToArray(form.specializations),
            pujaTypes: csvToArray(form.pujaTypes),
            associatedWith:
              form.associatedWith.trim(),
            about: form.about.trim(),
            availability:
              form.availability.trim(),
            serviceAreas: csvToArray(form.serviceAreas),
            ...(photoUrl
              ? {
                  photo: photoUrl,
                }
              : {}),
          }
        : {}),

      ...(selectedRole === "temple_manager" ||
      selectedRole === "ashram_manager"
        ? {
            designation:
              form.designation.trim(),
            organizationName:
              form.organizationName.trim(),
          }
        : {}),
    } as RegisterInput;

    try {
      const response = await register(payload);

      setSuccessMessage(response.message);

      if (response.authenticated) {
        navigate(
          getDashboardPathForRole(response.user.role),
          {
            replace: true,
          },
        );
        return;
      }

      /*
       * Professional roles remain unauthenticated until approval. The account
       * is created with the canonical role, but professional resource access
       * is still controlled by Admin approval and, for Temple/Ashram Managers,
       * assignment to the relevant resource.
       */
      setForm((current) => ({
        ...current,
        password: "",
        confirmPassword: "",
      }));
    } catch (error) {
      if (error instanceof Error && !authError) {
        await showError(
          "Registration failed",
          error.message || "Please try again.",
        );
      }
    } finally {
      setSubmitted(false);
    }
  };

  return (
    <Shell
      wide
      title="Join the DivyaDhara Parivaar"
      sub="Choose the account type that matches your journey. Devotees get normal account access; professional roles go through the required review and assignment process."
    >
      {authError && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-bold">
            Registration could not be completed
          </p>
          <p className="mt-1 leading-5">{authError}</p>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <CheckCircle2
            size={18}
            className="mt-0.5 shrink-0"
          />
          <div>
            <p className="font-bold">
              {roleNeedsApproval(selectedRole)
                ? "Registration submitted for review"
                : "Account created successfully"}
            </p>
            <p className="mt-1 leading-5">
              {successMessage}
            </p>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">
              Choose account type
            </p>

            <h2 className="font-display mt-1 text-xl font-semibold text-[#2a1a10]">
              How will you use DivyaDhara?
            </h2>

            <p className="mt-1 max-w-3xl text-xs leading-5 text-stone-500">
              Sales and Super Admin accounts are internal-only and are not
              available on this public registration page.
            </p>
          </div>

          <span className="hidden whitespace-nowrap text-xs font-bold text-stone-400 sm:block">
            4 public roles
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROLE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active =
              selectedRole === option.role;

            return (
              <button
                key={option.role}
                type="button"
                disabled={submitted}
                onClick={() =>
                  selectRole(option.role)
                }
                className={`group rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-orange-400 bg-orange-50 shadow-lg shadow-orange-900/5 ring-2 ring-orange-200"
                    : "border-orange-900/10 bg-white hover:border-orange-300 hover:bg-orange-50/40"
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-pressed={active}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      active
                        ? "bg-orange-600 text-white"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    <Icon size={18} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-[#2a1a10]">
                        {option.label}
                      </p>

                      {active && (
                        <CheckCircle2
                          size={16}
                          className="shrink-0 text-orange-600"
                        />
                      )}
                    </div>

                    <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">
                      {option.shortLabel}
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-stone-500">
                      {option.description}
                    </p>

                    <p className="mt-2 text-[10px] font-bold text-stone-400">
                      {option.approval}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl bg-[#2a1a10] p-4 text-white">
          <div className="flex items-start gap-3">
            <selectedRoleConfig.icon
              size={18}
              className="mt-0.5 shrink-0 text-amber-300"
            />

            <div>
              <p className="text-sm font-bold">
                {selectedRoleConfig.label}
              </p>

              <p className="mt-1 text-xs leading-relaxed text-stone-300">
                {selectedRole === "visitor"
                  ? "Normal devotee account. You can explore, enquire, book and save spiritual resources after registration."
                  : selectedRole === "pandit"
                    ? "Professional Pandit onboarding. Your profile remains subject to Admin review before the public professional listing becomes eligible."
                    : selectedRole === "temple_manager"
                      ? "Temple Manager onboarding. Admin approval and temple assignment control management access."
                      : "Ashram Manager onboarding. Admin approval and Ashram assignment control management access."}
              </p>

              <p className="mt-2 text-[11px] font-bold text-amber-300">
                {selectedRoleConfig.approval}
              </p>
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-6"
        noValidate
      >
        {/* Account details */}
        <section>
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">
              Account details
            </p>

            <h3 className="font-display mt-1 text-xl font-semibold text-[#2a1a10]">
              Tell us who you are
            </h3>

            <p className="mt-1 text-sm text-stone-500">
              These details identify the account owner and support account
              communication and role-specific onboarding.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-stone-600"
                htmlFor="register-name"
              >
                Full name *
              </label>

              <div className="relative">
                <User
                  size={16}
                  className="absolute left-3.5 top-3.5 text-orange-500"
                  aria-hidden="true"
                />

                <input
                  id="register-name"
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) =>
                    updateField(
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="e.g. Ananya Sharma"
                  className={inputWithIconClass}
                  disabled={submitted}
                />
              </div>
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-stone-600"
                htmlFor="register-email"
              >
                Email *
              </label>

              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-3.5 text-orange-500"
                  aria-hidden="true"
                />

                <input
                  id="register-email"
                  required
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) =>
                    updateField(
                      "email",
                      event.target.value,
                    )
                  }
                  placeholder="you@example.com"
                  className={inputWithIconClass}
                  disabled={submitted}
                />
              </div>
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-stone-600"
                htmlFor="register-phone"
              >
                Mobile *
              </label>

              <div className="relative">
                <Phone
                  size={16}
                  className="absolute left-3.5 top-3.5 text-orange-500"
                />

                <input
                  id="register-phone"
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) =>
                    updateField(
                      "phone",
                      event.target.value,
                    )
                  }
                  placeholder="+91 98XXXXXXXX"
                  className={inputWithIconClass}
                  disabled={submitted}
                />
              </div>
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-stone-600"
                htmlFor="register-city"
              >
                City *
              </label>

              <div className="relative">
                <MapPin
                  size={16}
                  className="absolute left-3.5 top-3.5 text-orange-500"
                />

                <input
                  id="register-city"
                  required
                  value={form.city}
                  onChange={(event) =>
                    updateField(
                      "city",
                      event.target.value,
                    )
                  }
                  placeholder="Your city"
                  className={inputWithIconClass}
                  disabled={submitted}
                />
              </div>
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-stone-600"
                htmlFor="register-state"
              >
                State
              </label>

              <input
                id="register-state"
                value={form.state}
                onChange={(event) =>
                  updateField(
                    "state",
                    event.target.value,
                  )
                }
                placeholder="Maharashtra"
                className={inputClass}
                disabled={submitted}
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-stone-600"
                htmlFor="register-country"
              >
                Country
              </label>

              <input
                id="register-country"
                value={form.country}
                onChange={(event) =>
                  updateField(
                    "country",
                    event.target.value,
                  )
                }
                placeholder="India"
                className={inputClass}
                disabled={submitted}
              />
            </div>
          </div>
        </section>

        {/* Profile photo */}
        <section className="rounded-3xl border border-orange-900/10 bg-gradient-to-br from-orange-50 to-amber-50 p-5 md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="shrink-0">
              <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-orange-200 bg-white shadow-sm">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Selected profile photo preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <ImagePlus
                      size={28}
                      className="mx-auto text-orange-500"
                    />
                    <p className="mt-1 text-[10px] font-bold text-stone-400">
                      Add photo
                    </p>
                  </div>
                )}

                {photoPreview && (
                  <button
                    type="button"
                    onClick={clearPhoto}
                    disabled={submitted}
                    className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white transition hover:bg-black/80 disabled:opacity-60"
                    aria-label="Remove selected photo"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">
                Profile photo
              </p>

              <h3 className="font-display mt-1 text-xl font-semibold text-[#2a1a10]">
                Add a trusted profile image
              </h3>

              <p className="mt-1 text-xs leading-5 text-stone-500">
                Upload JPG, PNG or WebP up to 3 MB for an instant preview.
                For persistent account storage, you can also provide an image
                URL supported by the current API.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  disabled={submitted}
                  onClick={() =>
                    photoInputRef.current?.click()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-orange-800 ring-1 ring-orange-200 transition hover:bg-orange-50 disabled:opacity-60"
                >
                  <Upload size={14} />
                  Choose Photo
                </button>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  className="hidden"
                  disabled={submitted}
                />

                {photoName && (
                  <span className="truncate text-xs font-semibold text-stone-500">
                    {photoName}
                  </span>
                )}
              </div>

              {photoError && (
                <p
                  role="alert"
                  className="mt-2 text-xs font-semibold text-rose-700"
                >
                  {photoError}
                </p>
              )}

              <div className="mt-4">
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="register-photo-url"
                >
                  Persistent image URL (optional)
                </label>

                <input
                  id="register-photo-url"
                  type="url"
                  value={form.photoUrl}
                  onChange={(event) =>
                    updateField(
                      "photoUrl",
                      event.target.value,
                    )
                  }
                  placeholder="https://example.com/your-photo.jpg"
                  className={inputClass}
                  disabled={submitted}
                />

                <p className="mt-1.5 text-[10px] leading-4 text-stone-400">
                  The current account API stores image references as text.
                  The selected file is intentionally kept as a client preview
                  rather than sent as a large base64 payload.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Account security */}
        <section>
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">
              Account security
            </p>

            <p className="mt-1 text-sm text-stone-500">
              Choose a strong password. Role approval is separate from account
              security.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-stone-600"
                htmlFor="register-password"
              >
                Password *
              </label>

              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-3.5 text-orange-500"
                />

                <input
                  id="register-password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  type={
                    showPassword ? "text" : "password"
                  }
                  value={form.password}
                  onChange={(event) =>
                    updateField(
                      "password",
                      event.target.value,
                    )
                  }
                  placeholder="Minimum 8 characters"
                  className={`${inputWithIconClass} pr-12`}
                  disabled={submitted}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (current) => !current,
                    )
                  }
                  className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-lg text-stone-400 transition hover:bg-orange-50 hover:text-orange-700"
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  disabled={submitted}
                >
                  {showPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-stone-600"
                htmlFor="register-confirm-password"
              >
                Confirm password *
              </label>

              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-3.5 text-orange-500"
                />

                <input
                  id="register-confirm-password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  value={form.confirmPassword}
                  onChange={(event) =>
                    updateField(
                      "confirmPassword",
                      event.target.value,
                    )
                  }
                  placeholder="Re-enter password"
                  className={`${inputWithIconClass} pr-12`}
                  disabled={submitted}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword(
                      (current) => !current,
                    )
                  }
                  className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-lg text-stone-400 transition hover:bg-orange-50 hover:text-orange-700"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  disabled={submitted}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Visitor-specific profile */}
        {selectedRole === "visitor" && (
          <section className="rounded-3xl border border-sky-200 bg-sky-50/50 p-5 md:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-600 text-white">
                <User size={18} />
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-700">
                  Visitor / Devotee profile
                </p>

                <h3 className="font-display mt-1 text-xl font-semibold text-[#2a1a10]">
                  Personal preferences & support details
                </h3>

                <p className="mt-1 text-xs leading-5 text-stone-500">
                  Optional information that makes your future spiritual
                  journey, enquiry and support experience more personal.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="visitor-language"
                >
                  Preferred language
                </label>

                <input
                  id="visitor-language"
                  value={form.preferredLanguage}
                  onChange={(event) =>
                    updateField(
                      "preferredLanguage",
                      event.target.value,
                    )
                  }
                  placeholder="Hindi, English, Maithili..."
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="visitor-dob"
                >
                  Date of birth
                </label>

                <input
                  id="visitor-dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) =>
                    updateField(
                      "dateOfBirth",
                      event.target.value,
                    )
                  }
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="visitor-gender"
                >
                  Gender
                </label>

                <select
                  id="visitor-gender"
                  value={form.gender}
                  onChange={(event) =>
                    updateField(
                      "gender",
                      event.target.value,
                    )
                  }
                  className={inputClass}
                  disabled={submitted}
                >
                  <option value="">
                    Prefer not to say
                  </option>
                  <option value="female">
                    Female
                  </option>
                  <option value="male">
                    Male
                  </option>
                  <option value="other">
                    Other
                  </option>
                </select>
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="visitor-pincode"
                >
                  PIN / Postal code
                </label>

                <input
                  id="visitor-pincode"
                  value={form.pincode}
                  onChange={(event) =>
                    updateField(
                      "pincode",
                      event.target.value,
                    )
                  }
                  placeholder="400001"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div className="md:col-span-2">
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="visitor-address"
                >
                  Address
                </label>

                <textarea
                  id="visitor-address"
                  rows={3}
                  maxLength={1000}
                  value={form.address}
                  onChange={(event) =>
                    updateField(
                      "address",
                      event.target.value,
                    )
                  }
                  placeholder="House / locality / address"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="visitor-emergency-name"
                >
                  Emergency contact name
                </label>

                <input
                  id="visitor-emergency-name"
                  value={
                    form.emergencyContactName
                  }
                  onChange={(event) =>
                    updateField(
                      "emergencyContactName",
                      event.target.value,
                    )
                  }
                  placeholder="Family member / contact person"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="visitor-emergency-phone"
                >
                  Emergency contact phone
                </label>

                <input
                  id="visitor-emergency-phone"
                  type="tel"
                  inputMode="tel"
                  value={
                    form.emergencyContactPhone
                  }
                  onChange={(event) =>
                    updateField(
                      "emergencyContactPhone",
                      event.target.value,
                    )
                  }
                  placeholder="+91 98XXXXXXXX"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <label className="md:col-span-2 flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-sky-100">
                <input
                  type="checkbox"
                  checked={form.marketingConsent}
                  onChange={(event) =>
                    updateField(
                      "marketingConsent",
                      event.target.checked,
                    )
                  }
                  className="mt-0.5 h-5 w-5 accent-sky-700"
                  disabled={submitted}
                />

                <span>
                  <span className="block text-sm font-bold text-stone-800">
                    Receive relevant DivyaDhara updates
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">
                    Allow useful festival, service and spiritual communication.
                    You can change this preference later.
                  </span>
                </span>
              </label>
            </div>
          </section>
        )}

        {/* Pandit professional onboarding */}
        {selectedRole === "pandit" && (
          <section className="rounded-3xl border border-orange-200 bg-orange-50/50 p-5 md:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-600 text-white">
                <GraduationCap size={18} />
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">
                  Pandit professional profile
                </p>

                <h3 className="font-display mt-1 text-xl font-semibold text-[#2a1a10]">
                  Build your public Pandit listing
                </h3>

                <p className="mt-1 text-xs leading-5 text-stone-500">
                  Professional details help devotees discover the right
                  Pandit. Approval and verification remain controlled by
                  DivyaDhara Admin.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-title"
                >
                  Title / Acharya designation *
                </label>

                <input
                  id="pandit-title"
                  value={form.title}
                  onChange={(event) =>
                    updateField(
                      "title",
                      event.target.value,
                    )
                  }
                  placeholder="Vedic Acharya · Rudrabhishek Specialist"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-experience"
                >
                  Experience (years)
                </label>

                <input
                  id="pandit-experience"
                  type="number"
                  min={0}
                  max={100}
                  value={form.experienceYears}
                  onChange={(event) =>
                    updateField(
                      "experienceYears",
                      event.target.value,
                    )
                  }
                  placeholder="15"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-district"
                >
                  District
                </label>

                <input
                  id="pandit-district"
                  value={form.district}
                  onChange={(event) =>
                    updateField(
                      "district",
                      event.target.value,
                    )
                  }
                  placeholder="Varanasi"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-languages"
                >
                  Languages
                </label>

                <input
                  id="pandit-languages"
                  value={form.languages}
                  onChange={(event) =>
                    updateField(
                      "languages",
                      event.target.value,
                    )
                  }
                  placeholder="Hindi, Sanskrit, English"
                  className={inputClass}
                  disabled={submitted}
                />
                <p className="mt-1 text-[10px] text-stone-400">
                  Separate multiple languages with commas.
                </p>
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-specializations"
                >
                  Specializations
                </label>

                <input
                  id="pandit-specializations"
                  value={form.specializations}
                  onChange={(event) =>
                    updateField(
                      "specializations",
                      event.target.value,
                    )
                  }
                  placeholder="Rudrabhishek, Vivah Sanskar"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-puja-types"
                >
                  Puja types *
                </label>

                <input
                  id="pandit-puja-types"
                  value={form.pujaTypes}
                  onChange={(event) =>
                    updateField(
                      "pujaTypes",
                      event.target.value,
                    )
                  }
                  placeholder="Havan, Rudrabhishek, Vivah Sanskar"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-associated"
                >
                  Associated with
                </label>

                <input
                  id="pandit-associated"
                  value={form.associatedWith}
                  onChange={(event) =>
                    updateField(
                      "associatedWith",
                      event.target.value,
                    )
                  }
                  placeholder="Temple / tradition / parampara"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-availability"
                >
                  Availability
                </label>

                <input
                  id="pandit-availability"
                  value={form.availability}
                  onChange={(event) =>
                    updateField(
                      "availability",
                      event.target.value,
                    )
                  }
                  placeholder="Mon-Sat · Advance booking 2 days"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div className="md:col-span-2">
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-service-areas"
                >
                  Service areas
                </label>

                <input
                  id="pandit-service-areas"
                  value={form.serviceAreas}
                  onChange={(event) =>
                    updateField(
                      "serviceAreas",
                      event.target.value,
                    )
                  }
                  placeholder="Varanasi, Kashi, nearby areas"
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div className="md:col-span-2">
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="pandit-about"
                >
                  About you
                </label>

                <textarea
                  id="pandit-about"
                  rows={5}
                  maxLength={5000}
                  value={form.about}
                  onChange={(event) =>
                    updateField(
                      "about",
                      event.target.value,
                    )
                  }
                  placeholder="Tell devotees about your training, ritual practice and services."
                  className={inputClass}
                  disabled={submitted}
                />

                <p className="mt-1 text-right text-[11px] text-stone-400">
                  {form.about.length} / 5000
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Temple / Ashram manager onboarding */}
        {(selectedRole === "temple_manager" ||
          selectedRole === "ashram_manager") && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-5 md:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
                {selectedRole === "temple_manager" ? (
                  <Building2 size={18} />
                ) : (
                  <HeartHandshake size={18} />
                )}
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">
                  {selectedRole === "temple_manager"
                    ? "Temple management"
                    : "Ashram management"}
                </p>

                <h3 className="font-display mt-1 text-xl font-semibold text-[#2a1a10]">
                  Professional onboarding details
                </h3>

                <p className="mt-1 text-xs leading-5 text-stone-500">
                  Provide your official role and organisation information.
                  Admin approval and resource assignment remain separate from
                  this self-registration form.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="manager-designation"
                >
                  Designation *
                </label>

                <input
                  id="manager-designation"
                  value={form.designation}
                  onChange={(event) =>
                    updateField(
                      "designation",
                      event.target.value,
                    )
                  }
                  placeholder={
                    selectedRole === "temple_manager"
                      ? "Temple Manager / Trust Representative"
                      : "Ashram Manager / Trust Representative"
                  }
                  className={inputClass}
                  disabled={submitted}
                />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-bold text-stone-600"
                  htmlFor="manager-organization"
                >
                  {selectedRole === "temple_manager"
                    ? "Temple / Organisation name *"
                    : "Ashram / Organisation name *"}
                </label>

                <input
                  id="manager-organization"
                  value={form.organizationName}
                  onChange={(event) =>
                    updateField(
                      "organizationName",
                      event.target.value,
                    )
                  }
                  placeholder={
                    selectedRole === "temple_manager"
                      ? "Temple or trust name"
                      : "Ashram or trust name"
                  }
                  className={inputClass}
                  disabled={submitted}
                />
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-white p-4 ring-1 ring-amber-100">
              <ShieldCheck
                size={16}
                className="mt-0.5 shrink-0 text-amber-700"
              />

              <p className="text-[11px] leading-5 text-stone-500">
                Registration does not self-assign a Temple or Ashram. DivyaDhara
                Admin controls approval and the assignment that unlocks
                management access.
              </p>
            </div>
          </section>
        )}

        <div className="rounded-2xl border border-orange-900/10 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck
              size={18}
              className="mt-0.5 shrink-0 text-orange-700"
            />

            <div>
              <p className="text-sm font-bold text-stone-800">
                What happens after registration?
              </p>

              <p className="mt-1 text-xs leading-5 text-stone-500">
                {selectedRole === "visitor"
                  ? "Your account can continue normally after successful registration."
                  : selectedRole === "pandit"
                    ? "Your Pandit account and professional profile remain pending for the applicable Admin verification/approval flow."
                    : selectedRole === "temple_manager"
                      ? "Your Temple Manager account enters the approval flow. Temple management becomes available only after the correct assignment is active."
                      : "Your Ashram Manager account enters the approval flow. Ashram management becomes available only after the correct Ashram assignment is active."}
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || submitted}
          className="btn-saffron flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading || submitted ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Creating account...
            </>
          ) : (
            <>
              <UserPlus size={16} />
              Create {selectedRole === "visitor"
                ? "Visitor Account"
                : selectedRole === "pandit"
                  ? "Pandit Account"
                  : selectedRole === "temple_manager"
                    ? "Temple Manager Account"
                    : "Ashram Manager Account"}
              <ArrowRight size={15} />
            </>
          )}
        </button>

        <div className="flex items-start gap-2 rounded-xl bg-stone-50 px-4 py-3 text-[11px] leading-5 text-stone-500">
          <ShieldCheck
            size={14}
            className="mt-0.5 shrink-0 text-orange-700"
          />

          <p>
            Sales and Super Admin are internal-only roles and cannot be created
            from this public page. Professional approval, verification,
            resource assignment and subscription access are controlled by the
            backend/business rules.
          </p>
        </div>

        <p className="text-center text-[13px] text-stone-500">
          Already a member?{" "}
          <Link
            to="/login"
            className="font-bold text-orange-700 hover:underline"
          >
            Login
          </Link>
        </p>
      </form>
    </Shell>
  );
}

/*
|--------------------------------------------------------------------------
| FORGOT PASSWORD
|--------------------------------------------------------------------------
*/

export function Forgot() {
  useSEO({
    title: "Forgot Password — DivyaDhara",
    description: "Request a secure password reset for your DivyaDhara account.",
    path: "/forgot-password",
  });

  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [developmentToken, setDevelopmentToken] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  const handleRequestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Email address is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/auth/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        resetToken?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || data.message || "Unable to request password reset.");
      }

      setEmail(cleanEmail);
      setDone(true);

      /*
       * Development-only reset token support is retained because the backend
       * intentionally exposes the temporary token outside production while
       * email delivery is being wired. Production never receives this token.
       */
      if (import.meta.env.DEV && data.resetToken) {
        setDevelopmentToken(data.resetToken);
        setResetMode(true);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to request password reset.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!developmentToken) {
      setError("Reset token is missing.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    setResetLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          token: developmentToken,
          password: newPassword,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || data.message || "Unable to reset password.");
      }

      setResetDone(true);
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset password.",
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <Shell
      title="Reset Password"
      sub="Request a secure password reset for your DivyaDhara account."
    >
      {error && (
        <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {resetDone ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 size={28} className="mx-auto text-emerald-600" />
            <p className="mt-3 text-sm font-bold text-emerald-900">Password reset successful</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-800">
              Your password has been updated. Please login again.
            </p>
          </div>

          <Link
            to="/login"
            className="btn-saffron flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white"
          >
            Go to Login
            <ArrowRight size={15} />
          </Link>
        </div>
      ) : resetMode && developmentToken ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold text-amber-900">Development password reset</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              Email delivery is not connected yet. A temporary development token
              has been supplied by the non-production backend.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-stone-600" htmlFor="dev-reset-token">
              Reset token
            </label>
            <input
              id="dev-reset-token"
              readOnly
              value={developmentToken}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-stone-600" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                required
                minLength={8}
                autoComplete="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-stone-600" htmlFor="confirm-new-password">
                Confirm new password
              </label>
              <input
                id="confirm-new-password"
                required
                minLength={8}
                autoComplete="new-password"
                type="password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                placeholder="Re-enter new password"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={resetLoading}
              className="btn-saffron flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {resetLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Updating password...
                </>
              ) : (
                <>
                  <Lock size={15} />
                  Reset Password
                </>
              )}
            </button>
          </form>
        </div>
      ) : done ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 size={28} className="mx-auto text-emerald-600" />
            <p className="mt-3 text-sm font-bold text-emerald-900">Reset request received</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-800">
              If an account exists for <strong>{email}</strong>, a reset link will be sent.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setDone(false);
              setEmail("");
              setError(null);
            }}
            className="w-full rounded-xl border border-orange-900/10 bg-stone-50 px-5 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-100"
          >
            Request another reset
          </button>

          <p className="text-center text-[13px]">
            <Link to="/login" className="font-bold text-orange-700 hover:underline">
              ← Back to login
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={handleRequestReset} className="space-y-4" noValidate>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-stone-600" htmlFor="forgot-email">
              Email address
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-3.5 text-orange-500" />
              <input
                id="forgot-email"
                required
                autoFocus
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                className={inputWithIconClass}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-saffron flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Sending request...
              </>
            ) : (
              <>
                Send Reset Link
                <ArrowRight size={15} />
              </>
            )}
          </button>

          <p className="text-center text-[13px]">
            <Link to="/login" className="font-bold text-orange-700 hover:underline">
              ← Back to login
            </Link>
          </p>

          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
            <ShieldCheck size={13} />
            We do not reveal whether an email is registered.
          </p>
        </form>
      )}
    </Shell>
  );
}
