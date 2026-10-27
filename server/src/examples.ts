// Fixed sample roles for the landing page. They're free (no quota) and show every Pro section,
// so visitors see the full product before spending one of their own lookups.
export const EXAMPLES = {
  'swe-google-sf': { label: 'Senior SWE · Google · SF', title: 'Senior Software Engineer', company: 'Google', location: 'San Francisco Bay Area', yearsExperience: 7 },
  'pm-stripe-nyc': { label: 'PM · Stripe · NYC', title: 'Product Manager', company: 'Stripe', location: 'New York, NY', yearsExperience: 4 },
  'nurse-mayo': { label: 'Nurse · Mayo Clinic', title: 'Registered Nurse', company: 'Mayo Clinic', location: 'Rochester, Minnesota, United States', yearsExperience: 6 },
  'ds-spotify-london': { label: 'Data Scientist · London', title: 'Senior Data Scientist', company: 'Spotify', location: 'London, United Kingdom', yearsExperience: 6 },
  'swe-razorpay-blr': { label: 'Engineer · Bengaluru', title: 'Software Engineer', company: 'Razorpay', location: 'Bengaluru, Karnataka, India', yearsExperience: 3 },
} as const;

export type ExampleId = keyof typeof EXAMPLES;
export const isExampleId = (v: unknown): v is ExampleId => typeof v === 'string' && Object.hasOwn(EXAMPLES, v);
