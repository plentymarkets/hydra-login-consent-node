import express from 'express'
import url from 'url'
import urljoin from 'url-join'
import csrf from 'csurf'
import {hydraAdmin} from '../config'

// Sets up csrf protection
const csrfProtection = csrf({cookie: true});
const router = express.Router();

const exampleUsers = ['thomas@plenty.com', 'christoph@plenty.com', 'götz@plenty.com', 'marcus@plenty.com'];

router.get('/', csrfProtection, (req, res, next) => {
  // Parses the URL query
  const query = url.parse(req.url, true).query;

  // The challenge is used to fetch information about the login request from ORY Hydra.
  const challenge = String(query.login_challenge);
  if (!challenge) {
    next(new Error('Expected a login challenge to be set but received none.'))
    return
  }

  hydraAdmin.getLoginRequest(challenge)
    .then(({body}) => {
      // If hydra was already able to authenticate the user, skip will be true and we do not need to re-authenticate
      // the user.
      if (body.skip) {
        // You can apply logic here, for example update the number of times the user logged in.
        // ...

        // Now it's time to grant the login request. You could also deny the request if something went terribly wrong
        // (e.g. your arch-enemy logging in...)
        return hydraAdmin.acceptLoginRequest(challenge, {
          // All we need to do is to confirm that we indeed want to log in the user.
          subject: String(body.subject)
        }).then(({body}) => {
          // All we need to do now is to redirect the user back to hydra!
          res.redirect(String(body.redirectTo));
        });
      }

      // If authentication can't be skipped we MUST show the login UI.
      res.render('login', {
        csrfToken: req.csrfToken(),
        challenge: challenge,
        action: urljoin(process.env.BASE_URL || '', '/login'),
      });
    })
    // This will handle any error that happens when making HTTP calls to hydra
    .catch(next);
});

router.post('/', csrfProtection, (req, res, next) => {
  // The challenge is now a hidden input field, so let's take it from the request body instead
  const challenge = req.body.challenge;

  // Let's see if the user decided to accept or reject the consent request..
  if (req.body.submit === 'Deny access') {
    // Looks like the consent request was denied by the user
    return hydraAdmin.rejectLoginRequest(challenge, {
      error: 'access_denied',
      errorDescription: 'The resource owner denied the request'
    }).then(({body})=> {
      // All we need to do now is to redirect the browser back to hydra!
      res.redirect(String(body.redirectTo));
    })
      // This will handle any error that happens when making HTTP calls to hydra
      .catch(next);
  }

  // Let's check if the user provided valid credentials. Of course, you'd use a database or some third-party service
  // for this!
  if (!(exampleUsers.includes(req.body.email) && req.body.password === 'foobar')) {
    // Looks like the user provided invalid credentials, let's show the ui again...

    res.render('login', {
      csrfToken: req.csrfToken(),
      challenge: challenge,
      error: 'The username / password combination is not correct'
    });

    return
  }

  // Seems like the user authenticated! Let's tell hydra...
  hydraAdmin.acceptLoginRequest(challenge, {
    // Subject is an alias for user ID. A subject can be a random string, a UUID, an email address, ....
    subject: req.body.email,

    // This tells hydra to remember the browser and automatically authenticate the user in future requests. This will
    // set the "skip" parameter in the other route to true on subsequent requests!
    remember: Boolean(req.body.remember),

    // When the session expires, in seconds. Set this to 0 so it will never expire.
    rememberFor: 3600,

    // Sets which "level" (e.g. 2-factor authentication) of authentication the user has. The value is really arbitrary
    // and optional. In the context of OpenID Connect, a value of 0 indicates the lowest authorization level.
    // acr: '0',
  })
    .then( ({body})=> {
      // All we need to do now is to redirect the user back to hydra!
      res.redirect(String(body.redirectTo));
    })
    // This will handle any error that happens when making HTTP calls to hydra
    .catch(next);

  // You could also deny the login request which tells hydra that no one authenticated!
  // hydra.rejectLoginRequest(challenge, {
  //   error: 'invalid_request',
  //   errorDescription: 'The user did something stupid...'
  // })
  //   .then(({body}) => {
  //     // All we need to do now is to redirect the browser back to hydra!
  //     res.redirect(String(body.redirectTo));
  //   })
  //   // This will handle any error that happens when making HTTP calls to hydra
  //   .catch(next);
});

export default router
