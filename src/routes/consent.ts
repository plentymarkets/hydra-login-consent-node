import express from 'express'
import url from 'url'
import urljoin from 'url-join'
import csrf from 'csurf'
import {hydraAdmin} from '../config'

// Sets up csrf protection
const csrfProtection = csrf({cookie: true})
const router = express.Router()

hydraAdmin.listOAuth2Clients(10,0).then(({body}) => {
  body.forEach((client) => {
    console.log(client)
  })
})

router.get('/', csrfProtection, (req, res, next) => {

  console.log("GET consent request", req);

  // Parses the URL query
  const query = url.parse(req.url, true).query;

  // The challenge is used to fetch information about the consent request from ORY hydraAdmin.
  const challenge = String(query.consent_challenge);
  if (!challenge) {
    next(new Error('Expected a consent challenge to be set but received none.'))
    return
  }

  hydraAdmin.getConsentRequest(challenge)
    // This will be called if the HTTP request was successful
    .then(({body}) => {

      console.log("Body from hydraAdmin.getConsentRequest", body);

      // If a user has granted this application the requested scope, hydra will tell us to not show the UI.
      if (body.skip) {
        // You can apply logic here, for example grant another scope, or do whatever...
        // ...

        // Now it's time to grant the consent request. You could also deny the request if something went terribly wrong
        return hydraAdmin.acceptConsentRequest(challenge, {
          // We can grant all scopes that have been requested - hydra already checked for us that no additional scopes
          // are requested accidentally.
          grantScope: body.requestedScope,

          // ORY Hydra checks if requested audiences are allowed by the client, so we can simply echo this.
          grantAccessTokenAudience: body.requestedAccessTokenAudience,

          // The session allows us to set session data for id and access tokens
          session: {
            // This data will be available when introspecting the token. Try to avoid sensitive information here,
            // unless you limit who can introspect tokens.
            // accessToken: { foo: 'bar' },

            // This data will be available in the ID token.
            // idToken: { baz: 'bar' },
          }
        }).then(({body}) => {

          console.log("Body from hydraAdmin.acceptConsentRequest", body);

          // All we need to do now is to redirect the user back to hydra!
          res.redirect(String(body.redirectTo));
        });
      }

      // If consent can't be skipped we MUST show the consent UI.
      res.render('consent', {
        csrfToken: req.csrfToken(),
        challenge: challenge,
        // We have a bunch of data available from the response, check out the API docs to find what these values mean
        // and what additional data you have available.
        requested_scope: body.requestedScope,
        user: body.subject,
        client: body.client,
        action: urljoin(process.env.BASE_URL || '', '/consent'),
      });
    })
    // This will handle any error that happens when making HTTP calls to hydra
    .catch(next);
});

router.post('/', csrfProtection, (req, res, next) => {

  console.log("POST consent request", req);

  // The challenge is now a hidden input field, so let's take it from the request body instead
  const challenge = req.body.challenge;

  // Let's see if the user decided to accept or reject the consent request..
  if (req.body.submit === 'Deny access') {
    // Looks like the consent request was denied by the user
    return hydraAdmin.rejectConsentRequest(challenge, {
      error: 'access_denied',
      errorDescription: 'The resource owner denied the request'
    }).then(({body}) => {
        // All we need to do now is to redirect the browser back to hydra!
        res.redirect(String(body.redirectTo));
      })
      // This will handle any error that happens when making HTTP calls to hydra
      .catch(next);
  }

  let grantScope = req.body.grant_scope
  if (!Array.isArray(grantScope)) {
    grantScope = [grantScope]
  }

  // The session allows us to set session data for id and access tokens
  let session = {
    // This data will be available when introspecting the token. Try to avoid sensitive information here,
    // unless you limit who can introspect tokens.
    accessToken: {
      // foo: 'bar'
    },

    // This data will be available in the ID token.
    idToken: {
      // baz: 'bar'
    },
  }

  // Here is also the place to add data to the ID or access token. For example,
  // if the scope 'profile' is added, add the family and given name to the ID Token claims:
  // if (grantScope.indexOf('profile')) {
  //   session.id_token.family_name = 'Doe'
  //   session.id_token.given_name = 'John'
  // }

  // Let's fetch the consent request again to be able to set `grantAccessTokenAudience` properly.
  hydraAdmin.getConsentRequest(challenge)
    // This will be called if the HTTP request was successful
    .then(({body}) => {

      console.log("Body from hydraAdmin.getConsentRequest", body);

      return hydraAdmin.acceptConsentRequest(challenge, {
        // We can grant all scopes that have been requested - hydra already checked for us that no additional scopes
        // are requested accidentally.
        grantScope: grantScope,

        // The session allows us to set session data for id and access tokens
        session: session,

        // ORY Hydra checks if requested audiences are allowed by the client, so we can simply echo this.
        grantAccessTokenAudience: body.requestedAccessTokenAudience,

        // This tells hydra to remember this consent request and allow the same client to request the same
        // scopes from the same user, without showing the UI, in the future.
        remember: Boolean(req.body.remember),

        // When this "remember" sesion expires, in seconds. Set this to 0 so it will never expire.
        rememberFor: 3600,
      }).then(({body}) => {

        console.log("Body from hydraAdmin.acceptConsentRequest", body);

        // All we need to do now is to redirect the user back to hydra!
        res.redirect(String(body.redirectTo));
      })
    })
    // This will handle any error that happens when making HTTP calls to hydra
    .catch(next);
});

export default router
