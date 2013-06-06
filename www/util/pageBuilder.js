var session = require('./session.js'),
    cli = require('cli-color'),
    i18n = require('./i18n.js');

/**
 * Default renderer options
 */
var defaultOptions = {
    title: {
        suffix: ' | Meeveep'
    }
};

/**
 * Default variables that are expected for each page
 */
var standardVariables = {
    title:              'txtDefaultTitle',
    header_slogan:      'txtHeaderSlogan',
    star_alarm:         'txtStarAlarm',
    how_it_works:       'txtHowMeeveepWorks',
    login_intro:        'txtLoginIntro',
    txtLogin:           'txtLogin',
    login_email:        'txtEmailAddress',
    login_password:     'txtPassword',
    login_submit:       'txtSubmit',
    login_no_account:   'txtNoAccount',
    login_register:     'txtRegister',
    nltTitle:           'txtKeepPosted',
    nltIntroText:       'txtNewsletterIntro',
    subscribe:          'txtSubscribe',
    enter_email_here:   'txtEnterEmail',
    footer_info_about:  'txtInfoAbout',
    management_clubs:   'txtManagementClubs',
    footer_pave_way:    'txtFooterPaveWay',
    register_here:      'txtRegisterHere',
    celerities:         'txtCelebrities',
    celeb_closeness:    'txtCelebCloseness',
    footer_trust:       'txtYouCanTrustUs',
    footer_trust_text:  'txtFtTrustText',
    meeveep_secure:     'txtMeeveepSecure',
    meeveep_secure_txt: 'txtFtMeeveepSecureTxt',
    txt‌Login:           'txtLogin',
    txtHelp:            {text:'txtHelp',filter:'toLowerCase'},
    txtPrivacy:         {text:'txtPrivacy',filter:'toLowerCase'},
    txtContact:         {text:'txtContact',filter:'toLowerCase'},
    txtLegal:           {text:'txtLegal',filter:'toLowerCase'},
    txtTerms:           {text:'txtTerms',filter:'toLowerCase'},
    txtService:         'txtService',
    partials:           {sidebar: 'sidebar'}
};

function render (opts, req, res, next, callback) {
    // The template variables
    var vars = opts.vars;
    var lang = opts.lang || req.lang;
    
    i18n.getLangFile(lang, function (err, langFile) {
        if(err) {
            throw err;
        }
        
        // Merge vars into the standard variables
        vars = {}.extend(standardVariables).extend(vars);
        
        vars.loggedIn = req.isLoggedIn();
        
        if(vars.loggedIn) {
            req.getUser(function (err, user) {
                if(err) {
                    console.error(cli.red('Something went wrong at page render'), err);
                    //return res.send('Internal Server Error', 500);
                    renderPage();
                } else {
                    vars.loggedInUser = user.userData;
                    renderPage();
                }
            });
        } else {
            renderPage();
        }
        
        function renderPage () {
            // Go over the whole variables and convert them to languages
            if(langFile) {
                var variable,
                    txt;
                
                for(var i in vars) {
                    variable = vars[i];
                    
                    /*
                    if(variable instanceof Array) {
                        // The variable has some replacement variables
                        txtId = variable.shift();
                        txt = langFile[txtId]; // The text with possible placeholders
                        txt = txt.format.apply(txt, variable);
                    } else */
                    if (variable instanceof Object) {
                        // The variable is formal
                        txt = variable.literal || langFile[variable.text] || variable.text;
                        
                        if('string' !== typeof txt && 'number' !== typeof txt) {
                            vars[i] = variable;
                            continue;
                        }
                        
                        if(variable.variables instanceof Array) {
                            // An array of variables provided
                            txt = txt.format.apply(txt, variable.variables);
                        }
                        
                        if(variable.filter) {
                            var filter = variable.filter;
                            
                            if(!(filter instanceof Array)) {
                                filter = [filter];
                            }
                            
                            filter.forEach(function (filter) {
                                if(typeof filter === 'string' && 'function' === typeof txt[filter]) {
                                    // A method of the string
                                    txt = txt[filter]();
                                } else if('function' === typeof filter) {
                                    // An absolute function
                                    txt = filter(txt);
                                }
                            });
                        }
                    } else {
                        txt = langFile[variable];
                    }
                    
                    if('undefined' !== typeof txt) {
                        // Replace varaible if and only if it was found in the language file. Some content might be
                        // pre-translated and will return "undefined"
                        vars[i] = txt;
                    }
                }
            }
            
            // Page title
            vars.title = (opts.title.prefix || '') + (vars.title || '') + (opts.title.suffix || '');
            
            var layout = opts.layout || 'layout';
            
            // deal with the language selector bar
            var langs = i18n.getAvailableLaguages();
            vars['_lang-id'] = lang;
            vars.availableLangs = langs;
            
            // Attach the user variable
            if('undefined' === typeof vars.user) {
                req.getUser(function (err, user) {
                    if(err || !user) {
                        return render();
                    }
                    
                    vars.user = user.userData;
                    render();
                });
            } else {
                render();
            }
            
            function render() {
                res.render(opts.page, vars, callback);
            }
        }
    });
}

module.exports = function (options) {
    options = options || {};
    
    options = {}.extend(defaultOptions).extend(options);
    
    var obj =  {
        options: options,
        
        /**
         * Set the options for the current renderer
         */
        setOptions: function (opts) {
            options.extend(opts);
        },
        
        /**
         * Render page
         */
        render: function (opts, req, res, next, callback) {
            render ({}.extend(options).extend(opts), req, res, next, callback);
        }
    };
    
    return obj;
};



