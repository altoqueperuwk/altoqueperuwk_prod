import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import { createCalificacionHandler } from "./handler.ts";

Deno.serve(createCalificacionHandler({
    env: (key) => Deno.env.get(key),
    database: (url, key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    fetch,
}));
