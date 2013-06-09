module.exports = {
    mongo: {
        mail2sms: {
            host:   process.env.MONGO_HOST || '127.0.0.1',
            port:   process.env.MONGO_PORT || 27017,
            db:     'mail2sms',
            auth:   {
                username: 'mail2sms',
                password: 'ARfZH|CW1%:ixEk>zpW,9KIO%cM/px04&h;@>jQO'
            },
            collections: ['users','contacts','groups','groups.stats','contacts.tmp','messages.log', 'activities.log','message.log']
        }
    }
};

