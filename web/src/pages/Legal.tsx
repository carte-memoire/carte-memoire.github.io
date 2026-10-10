import { Link } from 'react-router-dom';

// Pages légales : mentions légales, confidentialité, conditions d'utilisation.
// L'éditeur est un particulier, à titre non professionnel : il peut rester sous pseudonyme
// (LCEN, art. 6, III, 2), ses hébergeurs pouvant l'identifier.
const PUBLISHER = 'Nameho';
// Adresse de contact (droits sur les données, contenus illicites, retrait d'une image)
const CONTACT_EMAIL = '';
// Version des conditions d'utilisation, enregistrée avec chaque inscription
export const TERMS_VERSION = '2026-10-10';

function Contact() {
  return CONTACT_EMAIL
    ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    : <>l'adresse de contact (bientôt indiquée ici)</>;
}

export function LegalNotice() {
  return (
    <article className="panel legal">
      <h1>Mentions légales</h1>

      <h2>Éditeur du site</h2>
      <p>
        Carte Mémoire est édité par <strong>{PUBLISHER}</strong>, un particulier, à titre non professionnel et sans but
        lucratif : le site est gratuit, sans publicité et ne vend rien.
      </p>
      <p>
        Conformément à l'article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie
        numérique, l'éditeur a choisi de rester sous pseudonyme ; ses hébergeurs disposent des éléments permettant de
        l'identifier.
      </p>
      <p>Directeur de la publication : {PUBLISHER}. Contact : <Contact />.</p>

      <h2>Conception</h2>
      <p>
        Le site a été imaginé par {PUBLISHER} : idées, choix et vérifications. Il a été programmé avec l'aide d'une
        intelligence artificielle (Claude, d'Anthropic). Les données du catalogue ne sont pas inventées par l'IA : elles
        viennent de Wikipédia, de Wikidata, de Redump et des membres. Le code est public, sur{' '}
        <a href="https://github.com/carte-memoire/carte-memoire.github.io" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>

      <h2>Hébergement</h2>
      <p>
        Pages du site : GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107,
        États-Unis ; téléphone : +1 877 448 4820 (<a href="https://github.com" target="_blank" rel="noopener noreferrer">github.com</a>).
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
        couverts par la licence du catalogue. Un ayant droit qui souhaite le retrait d'une image peut écrire à <Contact /> :
        elle sera retirée rapidement.
      </p>
      <p>
        Carte Mémoire est un site de fans, indépendant : il n'a aucun lien avec les constructeurs de consoles ni avec les
        éditeurs de jeux. Les noms de consoles, de jeux et de sociétés cités sont des marques de leurs propriétaires respectifs,
        employés uniquement pour désigner les produits.
      </p>

      <h2>Signaler un contenu</h2>
      <p>
        Une erreur dans le catalogue : bouton « Signaler une erreur » sur la fiche du jeu. Un contenu illicite, ou qui porte
        atteinte à tes droits : écris à <Contact />, en précisant la page concernée.
      </p>
      <p>
        <Link to="/conditions">Conditions d'utilisation</Link> · <Link to="/confidentialite">Données personnelles et confidentialité</Link>
      </p>
    </article>
  );
}

export function Privacy() {
  return (
    <article className="panel legal">
      <h1>Données personnelles et confidentialité</h1>

      <h2>Qui est responsable ?</h2>
      <p>
        {PUBLISHER}, l'éditeur du site (voir les <Link to="/mentions-legales">mentions légales</Link>), joignable à <Contact />.
      </p>

      <h2>Quelles données, et pourquoi ?</h2>
      <ul>
        <li>
          <strong>Ton compte</strong> : adresse e-mail, pseudo, mot de passe (enregistré sous une forme illisible, jamais en clair),
          passkeys et double authentification, et la version des conditions d'utilisation que tu as acceptée. Pour te connecter
          et protéger ton compte.
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
        Base légale : le service que tu demandes en créant un compte (les <Link to="/conditions">conditions d'utilisation</Link>),
        et l'intérêt légitime pour la sécurité et l'historique du catalogue. Aucune donnée n'est vendue, ni utilisée pour de la
        publicité.
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
        <li>Pour toute autre demande (accès, opposition, limitation…) : <Contact />. Réponse sous un mois.</li>
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

export function Terms() {
  return (
    <article className="panel legal">
      <h1>Conditions d'utilisation</h1>
      <p className="muted small">Version du {new Date(TERMS_VERSION).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</p>

      <h2>1. Le site</h2>
      <p>
        Carte Mémoire recense les jeux vidéo, version par version, et permet à chacun de suivre sa collection. Le site est
        gratuit, sans publicité et ne vend rien ; il est édité par un particulier (voir les{' '}
        <Link to="/mentions-legales">mentions légales</Link>). Le consulter ne demande pas de compte.
      </p>

      <h2>2. Ton compte</h2>
      <ul>
        <li>Il est gratuit. Il faut avoir au moins 15 ans, ou l'accord d'un parent.</li>
        <li>Un compte par personne. Garde ton mot de passe secret : ce qui est fait avec ton compte est sous ta responsabilité.</li>
        <li>Ton pseudo est public : pas d'insulte, ni de nom qui imite une autre personne ou une marque.</li>
      </ul>

      <h2>3. Ta collection</h2>
      <p>
        Elle t'appartient et reste privée, sauf si tu la rends publique. Tu peux l'exporter à tout moment (fichier CSV).
        Les informations du catalogue sont données sans garantie : elles peuvent contenir des erreurs, et ne constituent
        ni une cote ni un prix.
      </p>

      <h2>4. Tes contributions</h2>
      <ul>
        <li>
          Les jeux, versions, corrections et résumés que tu proposes sont relus par un modérateur avant d'être publiés.
        </li>
        <li>
          Une fois publiés, ces textes et données font partie du catalogue, sous licence{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> :
          chacun peut les réutiliser, en citant la source et sous la même licence. En les proposant, tu acceptes cette licence
          et tu garantis qu'ils viennent de toi, ou d'une source compatible que tu indiques (Wikipédia, Wikidata…).
        </li>
        <li>
          Images : uniquement des photos ou scans de jeux (jaquette, disque, notice). Les visuels restent la propriété de leurs
          éditeurs et ne sont pas couverts par la licence du catalogue ; en envoyant une photo, tu autorises Carte Mémoire à
          l'afficher sur la fiche du jeu.
        </li>
        <li>
          Interdits : contenus illicites, injurieux ou haineux, publicité, données personnelles d'autrui, liens vers des copies
          pirates (ROM, ISO), envois en masse.
        </li>
      </ul>

      <h2>5. Modération</h2>
      <p>
        Les modérateurs peuvent accepter, corriger, refuser ou retirer une contribution ; un refus est accompagné d'un motif.
        Toute modification du catalogue est notée dans un historique. En cas d'abus, un compte peut être supprimé.
      </p>

      <h2>6. Signaler un contenu</h2>
      <p>
        Une erreur : bouton « Signaler une erreur » sur la fiche du jeu. Un contenu illicite ou qui porte atteinte à tes droits
        (par exemple une image dont tu es l'ayant droit) : écris à <Contact /> en indiquant la page ; le contenu sera examiné et,
        s'il le faut, retiré rapidement.
      </p>

      <h2>7. Disponibilité</h2>
      <p>
        Le site est fourni tel quel, sans garantie de disponibilité : il peut être interrompu, évoluer ou fermer. Pense à
        exporter ta collection de temps en temps.
      </p>

      <h2>8. Données personnelles</h2>
      <p>
        Voir <Link to="/confidentialite">Données personnelles et confidentialité</Link>. Tu peux supprimer ton compte à tout
        moment dans « Mon compte » : ta collection est effacée, tes contributions au catalogue restent, sans ton nom.
      </p>

      <h2>9. Changements</h2>
      <p>
        Ces conditions peuvent évoluer ; un changement important sera annoncé sur le site. Elles sont soumises au droit
        français.
      </p>
    </article>
  );
}
