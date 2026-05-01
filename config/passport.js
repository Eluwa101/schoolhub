const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { supabaseAdmin } = require('../utils/supabaseClient');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('[passport] Google OAuth disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set.');
} else {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value;
          const avatarUrl = profile.photos[0]?.value;

          // Find user in Supabase auth by email
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
          const existingUser = listData?.users?.find(u => u.email === email);

          if (existingUser) {
            // User exists in auth — fetch their profile
            const { data: profileData } = await supabaseAdmin
              .from('profiles')
              .select('*, schools:school_id (id, name, slug)')
              .eq('id', existingUser.id)
              .single();

            if (profileData) {
              return done(null, {
                id: existingUser.id,
                email,
                profile: profileData,
                isNewUser: false,
              });
            }

            // Auth user exists but no profile yet — treat as new user without re-creating auth record
            return done(null, {
              id: existingUser.id,
              email,
              displayName: profile.displayName,
              avatarUrl,
              isNewUser: true,
            });
          }

          // Brand new user — create in Supabase Auth
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: {
              full_name: profile.displayName,
              avatar_url: avatarUrl,
            },
          });

          if (createError) return done(createError);

          return done(null, {
            id: newUser.user.id,
            email,
            displayName: profile.displayName,
            avatarUrl,
            isNewUser: true,
          });
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
