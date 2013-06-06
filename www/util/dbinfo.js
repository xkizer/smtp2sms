module.exports = {
    mongo: {
        mail2sms: {
            host:   '127.0.0.1',
            port:   27017,
            db:     'mail2sms',
            auth:   {
                username: 'mail2sms',
                password: '\/xRNo>*Yh>-]x/HI#Lhu<!j'
            },
            collections: ['users','contacts','groups','groups.stats','contacts.tmp','messages.log', 'activities.log','message.log']
        }
    }
};
