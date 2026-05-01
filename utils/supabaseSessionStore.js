const session = require('express-session');
const { supabaseAdmin } = require('./supabaseClient');

class SupabaseSessionStore extends session.Store {
  async get(sid, fn) {
    try {
      const { data, error } = await supabaseAdmin
        .from('session')
        .select('sess, expire')
        .eq('sid', sid)
        .maybeSingle();

      if (error || !data) return fn(null, null);
      if (new Date(data.expire) < new Date()) {
        await this.destroy(sid, () => {});
        return fn(null, null);
      }
      return fn(null, data.sess);
    } catch (err) {
      return fn(err);
    }
  }

  async set(sid, sessionData, fn) {
    try {
      const maxAge = sessionData.cookie?.maxAge || 86400000;
      const expire = new Date(Date.now() + maxAge).toISOString();
      const { error } = await supabaseAdmin
        .from('session')
        .upsert({ sid, sess: sessionData, expire }, { onConflict: 'sid' });
      return fn(error || null);
    } catch (err) {
      return fn(err);
    }
  }

  async destroy(sid, fn) {
    try {
      const { error } = await supabaseAdmin.from('session').delete().eq('sid', sid);
      return fn(error || null);
    } catch (err) {
      return fn(err);
    }
  }

  async touch(sid, sessionData, fn) {
    try {
      const maxAge = sessionData.cookie?.maxAge || 86400000;
      const expire = new Date(Date.now() + maxAge).toISOString();
      const { error } = await supabaseAdmin
        .from('session')
        .update({ expire })
        .eq('sid', sid);
      return fn(error || null);
    } catch (err) {
      return fn(err);
    }
  }
}

module.exports = SupabaseSessionStore;
