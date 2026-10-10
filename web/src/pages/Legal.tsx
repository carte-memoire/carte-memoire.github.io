import { Link } from 'react-router-dom';

// Pages légales. Les passages [à compléter] dépendent de l'éditeur du site :
// à remplir avant d'annoncer le site.

export function LegalNotice() {
  return (
    <article className="panel legal">
      <h1>Mentions légales</h1>

      <h2>Éditeur du site</h2>
      <p>
        [à compléter : nom ou pseudonyme de l'éditeur, et une adresse e-mail de contact].
        Un particulier peut rester anonyme sur le site, à condition d'avoir communiqué son identité à l'hébergeur.
      </p>
      <p>Directeur de la publication : [à compléter].</p>

      <h2>Hébergement</h2>
      <p>
        Site : GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis ;
        téléphone : +1 877 448 4820 (<a href="https://github.com" target="_blank" rel="noopener noreferrer">github.com</a>).
      </p>
      <p>
        Base de données, comptes et images : Supabase Inc. (<a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a>),
        sur des serveurs Amazon Web Services situés à Paris (région eu-west-3).
      </p>

      <h2>Contenus et droits</h2>
      <p>
        Le catalogue (titres, dates, genres, codes produits…) est publié sous licence{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.
        Il provient en partie de Wikipédia et de Wikidata, de Redump et de libretro-database, et des contributions des membres.
      </p>
      <p>
        Les jaquettes et visuels des jeux appartiennent à leurs éditeurs respectifs ; ils illustrent les fiches et ne sont pas
        couverts par la licence du catalogue. Un ayant droit qui souhaite le retrait d'une image peut écrire à l'adresse de contact.
      </p>
      <p>
        Carte Mémoire est un site de fans, sans lien avec Sony Interactive Entertainment. « PlayStation » est une marque de Sony.
      </p>

      <h2>Signaler un contenu</h2>
      <p>
        Une erreur dans le catalogue : bouton « Signaler une erreur » sur la fiche du jeu. Un contenu illicite : écris à l'adresse
        de contact ci-dessus.
      </p>
      <p><Link to="/confidentialite">Données personnelles et confidentialité</Link></p>
    </article>
  );
}

export function Privacy() {
  return (
    <article className="panel legal">
      <h1>Données personnelles et confidentialité</h1>

      <h2>Qui est responsable ?</h2>
      <p>L'éditeur du site : [à compléter, comme dans les <Link to="/mentions-legales">mentions légales</Link>].</p>

      <h2>Quelles données, et pourquoi ?</h2>
      <ul>
        <li>
          <strong>Ton compte</strong> : adresse e-mail, pseudo, mot de passe (enregistré sous une forme illisible, jamais en clair),
          passkeys et double authentification. Pour te connecter et protéger ton compte.
        </li>
        <li>
          <strong>Ta collection</strong> : jeux possédés ou recherchés et leurs détails (état, prix, lieu d'achat, notes). Pour
          faire fonctionner ta collection. Elle est privée par défaut : personne d'autre ne la voit, à moins que tu la rendes
          publique.
        </li>
        <li>
          <strong>Tes contributions</strong> : propositions, signalements, modifications du catalogue, avec ton pseudo. Pour
          construire le catalogue collaboratif et garder un historique des changements.
        </li>
        <li>
          <strong>Données techniques</strong> : journaux de connexion tenus par nos hébergeurs (adresse IP, date) : GitHub pour
          les pages du site, Supabase pour la base de données. Pour la sécurité.
        </li>
      </ul>
      <p>
        Base légale : le service que tu demandes en créant un compte, et l'intérêt légitime pour la sécurité et l'historique du
        catalogue. Aucune donnée n'est vendue, ni utilisée pour de la publicité.
      </p>

      <h2>Qui y a accès ?</h2>
      <p>
        Toi ; les modérateurs pour les propositions, signalements et l'historique (jamais ta collection privée) ; et nos
        hébergeurs : Supabase, qui stocke les données sur des serveurs situés à Paris, et GitHub, qui sert les pages du site
        et garde l'adresse IP des visiteurs dans ses journaux de sécurité. Ces deux sociétés étant américaines, elles
        s'engagent par contrat (clauses contractuelles types de la Commission européenne) à protéger ces données.
      </p>

      <h2>Combien de temps ?</h2>
      <p>
        Tant que ton compte existe. Si tu le supprimes, ton compte, ton profil et ta collection sont effacés aussitôt ; tes
        contributions au catalogue restent, sans ton nom.
      </p>

      <h2>Tes droits</h2>
      <ul>
        <li>Consulter et corriger tes informations : <Link to="/compte">Mon compte</Link>.</li>
        <li>Récupérer ta collection : bouton « Exporter » dans <Link to="/collection">Ma collection</Link> (fichier CSV).</li>
        <li>Tout effacer : « Supprimer mon compte » dans <Link to="/compte">Mon compte</Link>.</li>
        <li>Pour toute autre demande : [à compléter : adresse e-mail de contact].</li>
      </ul>
      <p>
        Tu peux aussi adresser une réclamation à la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>).
      </p>

      <h2>Cookies</h2>
      <p>
        Pas de cookies publicitaires, ni de mesure d'audience. Ton navigateur garde seulement ta session de connexion et tes
        préférences d'affichage (console, région, liste ou jaquettes) : c'est indispensable au fonctionnement du site, donc
        aucun consentement n'est demandé.
      </p>
    </article>
  );
}
