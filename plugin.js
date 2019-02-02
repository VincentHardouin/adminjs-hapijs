const Boom = require('boom')
const inert = require('inert')
const AdminBro = require('admin-bro')
const SessionAuth = require('./extensions/session-auth')

module.exports = {
  name: 'AdminBro',
  version: '0.1.7',
  /**
   * Actual method which Hapi uses under the hood - when you call server.register(plugin, options) method.
   * Options you give in Hapi are passed back to it.
   *
   * @param  {Object} server                          hapijs server
   * @param  {Object} options                         options passed to AdminBro
   * @param  {Object} options.auth
   * @param  {Object} [options.auth.authenticate]     function taking email and password
   *                                                  as an arguments. Should return logged in
   *                                                  user or null (no authorization). If given
   *                                                  options.auth.strategy is set to 'session'.
   * @param  {Object} [options.auth.strategy]         auth strategy for hapijs routes. By default
   *                                                  set to none - all admin routes will be
   *                                                  available without authentication
   * @param  {Object} [options.auth.cookieName=adminBro] When auth strategy is set to session this
   *                                                     will be the name for the cookie.
   * @param  {Object} [options.auth.cookiePassword]   cookie password for session strategy
   * @param  {Object} [options.auth.isSecure=false]   if cookie should be accessible only via HTTPS,
   *                                                  default to false
   * @return {AdminBro}                               adminBro instance
   * @function register
   * @static
   * @memberof module:admin-bro-hapijs
   * @example
   * const AdminBroPlugin = require('admin-bro-hapijs')
   * const Hapi = require('hapi')
   * 
   * // see AdminBro documentation about setting up the database.
   * const yourDatabase = require('your-database-setup-file')
   * 
   * const ADMIN = {
   *   email: 'text@example.com',
   *   password: 'password',
   * }
   * 
   * const adminBroOptions = {
   *   resources: [yourDatabase],
   * 
   *   auth: {
   *     authenticate: (email, password) => {
   *       if (ADMIN.email === email && ADMIN.password === password) {
   *         return ADMIN
   *       }
   *       return null
   *     },
   *     strategy: 'session',
   *     cookieName: 'adminBroCookie',
   *     cookiePassword: process.env.COOKIE_PASSWORD || 'makesurepasswordissecure',
   *     isSecure: true, //only https requests
   *   },
   * }
   * 
   * const server = Hapi.server({ port: process.env.PORT || 8080 })
   * const start = async () => {
   *   await server.register({
   *     plugin: AdminBroPlugin,
   *     options: adminBroOptions,
   *   })
   * 
   *   await server.start()
   * }
   * 
   * start()
   */
  register: async (server, options) => {
    const admin = new AdminBro(options)
    let authStrategy = options.auth && options.auth.strategy
    const { routes, assets } = AdminBro.Router

    if (options.auth && options.auth.authenticate) {
      if (authStrategy && authStrategy !== 'session') {
        throw new Error(`When you gives auth.authenticate as a parameter - auth strategy is set to "session".
                         Please remove auth.strategy from authentication parameters.
                        `)
      }
      authStrategy = 'session'

      if (!options.auth.cookiePassword) {
        throw new Error('You have to give auth.cookiePassword parameter if you want to use authenticate function')
      }

      await SessionAuth(server, {
        loginPath: admin.options.loginPath,
        logoutPath: admin.options.logoutPath,
        rootPath: admin.options.rootPath,
        cookieName: 'admin-bro',
        ...options.auth,
      }, AdminBro)
    }

    routes.forEach((route) => {
      server.route({
        method: route.method,
        path: `${admin.options.rootPath}${route.path}`,
        options: { auth: authStrategy },
        handler: async (request, h) => {
          try {
            const loggedInUser = request.auth && request.auth.credentials
            const controller = new route.Controller({ admin }, loggedInUser)
            const ret = await controller[route.action](request, h)
            return ret
          } catch (e) {
            console.log(e)
            throw Boom.boomify(e)
          }
        },
      })
    })

    await server.register(inert)

    assets.forEach((asset) => {
      server.route({
        method: 'GET',
        options: { auth: false },
        path: `${admin.options.rootPath}${asset.path}`,
        handler: {
          file: () => asset.src,
        },
      })
    })

    return admin
  },
  /**
   * Renders login page. It simply invokes {@link AdminBro.renderLogin}
   * @memberof module:admin-bro-hapijs
   */
  renderLogin: async ({ action, errorMessage }) => (
    AdminBro.renderLogin({ action, errorMessage })
  ),
}
